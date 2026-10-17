(function (scope) {
  'use strict';
  var LIMIT = 104857600,
    activePlayer = null;
  function playbackRate(pitch) {
    pitch = Number(pitch);
    if (!Number.isFinite(pitch) || pitch < -24 || pitch > 24)
      throw new Error('피치는 -24~24 반음으로 입력하세요.');
    return Math.pow(2, pitch / 12);
  }
  function basicOnly(bytes) {
    return Number(bytes) > LIMIT;
  }
  function reverseChannels(channels) {
    return channels.map(function (channel) {
      var result = new Float32Array(channel.length);
      for (var i = 0; i < channel.length; i++) result[i] = channel[channel.length - 1 - i];
      return result;
    });
  }
  function envelope(channel, bins) {
    var result = [];
    bins = Math.max(1, Math.floor(bins));
    for (var i = 0; i < bins; i++) {
      var a = Math.floor((i * channel.length) / bins),
        b = Math.floor(((i + 1) * channel.length) / bins),
        min = 0,
        max = 0;
      for (var j = a; j < b; j++) {
        min = Math.min(min, channel[j]);
        max = Math.max(max, channel[j]);
      }
      result.push([min, max]);
    }
    return result;
  }
  function encodeWav(channels, sampleRate) {
    if (!channels.length || !Number.isFinite(sampleRate) || sampleRate < 1)
      throw new Error('PCM 오디오 형식이 올바르지 않습니다.');
    var frames = channels[0].length,
      count = channels.length;
    if (
      !channels.every(function (c) {
        return c.length === frames;
      })
    )
      throw new Error('오디오 채널 길이가 다릅니다.');
    var size = frames * count * 2;
    if (size > 0xffffffff - 36) throw new Error('WAV 파일 크기를 초과했습니다.');
    var bytes = new ArrayBuffer(44 + size),
      view = new DataView(bytes);
    function tag(at, text) {
      for (var i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
    }
    tag(0, 'RIFF');
    view.setUint32(4, 36 + size, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, count, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * count * 2, true);
    view.setUint16(32, count * 2, true);
    view.setUint16(34, 16, true);
    tag(36, 'data');
    view.setUint32(40, size, true);
    for (var frame = 0; frame < frames; frame++)
      for (var channel = 0; channel < count; channel++) {
        var sample = Math.max(-1, Math.min(1, channels[channel][frame]));
        if (!Number.isFinite(sample)) sample = 0;
        view.setInt16(
          44 + (frame * count + channel) * 2,
          Math.round(sample * (sample < 0 ? 32768 : 32767)),
          true,
        );
      }
    return bytes;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function readAudio(url, signal) {
    return fetch(url, { signal: signal })
      .then(function (response) {
        if (!response.ok) throw new Error('오디오 파일을 읽지 못했습니다.');
        var length = Number(response.headers.get('content-length'));
        if (basicOnly(length)) throw new Error('이 파일은 기본 오디오 재생을 사용하세요.');
        return response.arrayBuffer();
      })
      .catch(function (error) {
        if (signal.aborted) throw error;
        var req =
          typeof require === 'function' ? require : scope.cep_node && scope.cep_node.require;
        if (!scope.__adobe_cep__ || !req || !/^file:/i.test(url)) throw error;
        var file = req('url').fileURLToPath(url);
        if (!/\.(wav|aif|aiff|mp3|m4a|aac|ogg|flac)$/i.test(file))
          throw new Error('지원하는 오디오 파일을 선택하세요.');
        var fs = req('fs');
        if (basicOnly(fs.statSync(file).size))
          throw new Error('이 파일은 기본 오디오 재생을 사용하세요.');
        var data = fs.readFileSync(file);
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      })
      .then(function (bytes) {
        if (basicOnly(bytes.byteLength))
          throw new Error('이 파일은 기본 오디오 재생을 사용하세요.');
        return bytes;
      });
  }
  function mount(root, item, options) {
    options = options || {};
    var destroyed = false,
      context = null,
      buffer = null,
      reversedBuffer = null,
      source = null,
      gain = null,
      startedAt = 0,
      offset = 0,
      playing = false,
      pitch = options.initialOptions && Number.isFinite(options.initialOptions.pitchShift) ? Math.max(-24,Math.min(24,options.initialOptions.pitchShift)) : 0,
      reversed = !!(options.initialOptions && options.initialOptions.reverse),
      muted = false,
      volume = 1,
      ready = false,
      timer = null,
      controller = new AbortController(),
      pausedByActivity = false,
      basicPausedByActivity = false,
      wavePeaks = null,
      reversePeaks = null;
    try {
      var saved = Number(localStorage.getItem('contentrium-preset.audio-volume'));
      if (
        Number.isFinite(saved) &&
        saved >= 0 &&
        saved <= 1 &&
        localStorage.getItem('contentrium-preset.audio-volume') != null
      )
        volume = saved;
    } catch (ignore) {}
    var holder = el('div', 'audio-preview-player'),
      basic = el('audio'),
      load = el('button', '', '파형·피치 미리듣기'),
      advanced = el('div', 'audio-advanced hidden'),
      message = el('div', 'audio-preview-message'),
      buttons = el('div', 'workspace-actions'),
      play = el('button', '', '재생'),
      pause = el('button', '', '일시 정지'),
      restart = el('button', '', '처음부터'),
      mute = el('button', '', '음소거'),
      volumeInput = el('input'),
      time = el('output', 'audio-position'),
      canvas = el('canvas'),
      controls = el('div', 'audio-transform-controls'),
      pitchInput = el('input'),
      pitchRange = el('input'),
      reverseInput = el('input'),
      reset = el('button', '', '피치·방향 초기화');
    basic.src = item.preview;
    basic.controls = true;
    basic.preload = 'none';
    basic.volume = volume;
    holder.appendChild(basic);
    holder.appendChild(load);
    holder.appendChild(message);
    holder.appendChild(advanced);
    root.appendChild(holder);
    if (basicOnly(item.sourceFileSize || item.size)) {
      load.disabled = true;
      load.title = '100 MiB 초과 파일은 기본 플레이어를 사용합니다.';
      message.textContent = '100 MiB 초과 오디오 · 기본 재생';
    }
    advanced.appendChild(buttons);
    [restart, play, pause, mute].forEach(function (b) {
      b.type = 'button';
      buttons.appendChild(b);
    });
    volumeInput.type = 'range';
    volumeInput.min = 0;
    volumeInput.max = 100;
    volumeInput.value = volume * 100;
    volumeInput.setAttribute('aria-label', '오디오 미리듣기 볼륨');
    buttons.appendChild(volumeInput);
    buttons.appendChild(time);
    canvas.width = 640;
    canvas.height = 90;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', '오디오 파형 탐색');
    canvas.setAttribute('aria-valuemin', '0');
    advanced.appendChild(canvas);
    advanced.appendChild(controls);
    var pitchLabel = el('label', '', '미리듣기 피치 ');
    pitchInput.type = 'number';
    pitchInput.min = -24;
    pitchInput.max = 24;
    pitchInput.step = 0.1;
    pitchInput.value = pitch;
    pitchInput.setAttribute('aria-label', '미리듣기 피치');
    pitchLabel.appendChild(pitchInput);
    controls.appendChild(pitchLabel);
    pitchRange.type = 'range';
    pitchRange.min = -24;
    pitchRange.max = 24;
    pitchRange.step = 0.1;
    pitchRange.value = pitch;
    pitchRange.setAttribute('aria-label', '피치 슬라이더');
    controls.appendChild(pitchRange);
    var reverseLabel = el('label', '', 'Reverse ');
    reverseInput.type = 'checkbox';
    reverseInput.checked = reversed;
    if(pitch||reversed)advanced.classList.remove('hidden');
    reverseLabel.appendChild(reverseInput);
    controls.appendChild(reverseLabel);
    reset.type = 'button';
    controls.appendChild(reset);
    if (!options.applyTransforms)
      advanced.appendChild(el('p', 'workspace-help', '피치와 Reverse는 미리듣기에만 반영됩니다.'));
    function position() {
      return Math.max(
        0,
        Math.min(
          buffer ? buffer.duration : 0,
          offset + (playing ? (context.currentTime - startedAt) * playbackRate(pitch) : 0),
        ),
      );
    }
    function stop() {
      if (playing) offset = position();
      playing = false;
      if (source) {
        source.onended = null;
        try {
          source.stop();
        } catch (ignore) {}
        source.disconnect();
        source = null;
      }
      update();
    }
    function currentBuffer() {
      if (!reversed) return buffer;
      if (!reversedBuffer) {
        reversedBuffer = context.createBuffer(
          buffer.numberOfChannels,
          buffer.length,
          buffer.sampleRate,
        );
        var channels = [];
        for (var i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
        reverseChannels(channels).forEach(function (data, index) {
          reversedBuffer.copyToChannel(data, index);
        });
      }
      return reversedBuffer;
    }
    function start(at) {
      if (!ready || destroyed) return Promise.resolve();
      if (activePlayer && activePlayer !== api) activePlayer.pause();
      activePlayer = api;
      basic.pause();
      stop();
      offset = Math.max(0, Math.min(buffer.duration, at == null ? offset : at));
      if (offset >= buffer.duration) offset = 0;
      return context.resume().then(function () {
        if (destroyed) return;
        source = context.createBufferSource();
        source.buffer = currentBuffer();
        source.playbackRate.value = playbackRate(pitch);
        source.connect(gain);
        startedAt = context.currentTime;
        playing = true;
        var current = source;
        source.onended = function () {
          if (source === current) {
            source = null;
            playing = false;
            offset = 0;
            update();
          }
        };
        source.start(0, offset);
        update();
      });
    }
    function report(error) {
      if (destroyed || error.name === 'AbortError') return;
      message.textContent = error.message || String(error);
      if (options.onError) options.onError(error);
    }
    function update() {
      if (destroyed) return;
      play.disabled = !ready || playing;
      pause.disabled = !ready || !playing;
      restart.disabled = !ready;
      canvas.setAttribute('aria-valuenow', String(position()));
      canvas.setAttribute('aria-valuemax', String(buffer ? buffer.duration : 0));
      time.textContent =
        position().toFixed(2) + ' / ' + (buffer ? buffer.duration.toFixed(2) : '0.00') + '초';
      mute.textContent = muted ? '음소거 해제' : '음소거';
      if (!ready) return;
      var ctx = canvas.getContext('2d'),
        data = currentBuffer().getChannelData(0),
        peaks = reversed
          ? reversePeaks || (reversePeaks = envelope(data, canvas.width))
          : wavePeaks || (wavePeaks = envelope(data, canvas.width));
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#98b2c8';
      ctx.beginPath();
      peaks.forEach(function (pair, index) {
        ctx.moveTo(index, 45 + pair[0] * 40);
        ctx.lineTo(index, 45 + pair[1] * 40);
      });
      ctx.stroke();
      ctx.strokeStyle = '#eee';
      var x = (position() / buffer.duration) * canvas.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 90);
      ctx.stroke();
    }
    function loadWave(autoplay) {
      if(ready)return Promise.resolve();
      if(destroyed)return Promise.reject(new Error('오디오 미리듣기가 닫혔습니다.'));
      load.disabled = true;
      message.textContent = '오디오 미리듣기를 읽는 중…';
      var Audio = scope.AudioContext || scope.webkitAudioContext;
      if (!Audio) {
        message.textContent = '이 환경에서는 기본 오디오 재생을 사용하세요.';
        if(autoplay===false)return Promise.reject(new Error(message.textContent));
        return;
      }
      context = new Audio();
      gain = context.createGain();
      gain.connect(context.destination);
      gain.gain.value = muted ? 0 : volume;
      return readAudio(item.preview, controller.signal)
        .then(function (bytes) {
          return context.decodeAudioData(bytes);
        })
        .then(function (value) {
          if (destroyed) throw new Error('오디오 미리듣기가 닫혔습니다.');
          buffer = value;
          ready = true;
          advanced.classList.remove('hidden');
          basic.classList.add('hidden');
          message.textContent = '';
          timer = setInterval(update, 100);
          update();
          if(autoplay!==false)return start(0);
        })
        .catch(function (e) {
          load.disabled = false;
          if (context) {
            context.close().catch(function () {});
            context = null;
          }
          report(e);
          if(autoplay===false)throw e;
        });
    }
    function setPitch(value) {
      try {
        playbackRate(value);
        pitch = Number(value);
        pitchInput.value = pitch;
        pitchRange.value = pitch;
        start(0).catch(report);
        if (options.onChange) options.onChange(api.getOptions());
      } catch (e) {
        pitchInput.value = pitchRange.value = pitch;
        report(e);
      }
    }
    basic.onplay = function () {
      if (activePlayer && activePlayer !== api) activePlayer.pause();
      activePlayer = api;
    };
    basic.onvolumechange = function () {
      volume = basic.volume;
      muted = basic.muted;
      volumeInput.value = volume * 100;
      try {
        localStorage.setItem('contentrium-preset.audio-volume', String(volume));
      } catch (ignore) {}
    };
    load.onclick = function () {
      Promise.resolve(loadWave()).catch(report);
    };
    play.onclick = function () {
      start().catch(report);
    };
    pause.onclick = stop;
    restart.onclick = function () {
      start(0).catch(report);
    };
    mute.onclick = function () {
      muted = !muted;
      basic.muted = muted;
      if (gain) gain.gain.value = muted ? 0 : volume;
      update();
    };
    volumeInput.oninput = function () {
      volume = Number(volumeInput.value) / 100;
      basic.volume = volume;
      if (gain) gain.gain.value = muted ? 0 : volume;
      try {
        localStorage.setItem('contentrium-preset.audio-volume', String(volume));
      } catch (ignore) {}
    };
    pitchInput.onchange = function () {
      setPitch(pitchInput.value);
    };
    pitchRange.oninput = function () {
      setPitch(pitchRange.value);
    };
    reverseInput.onchange = function () {
      reversed = reverseInput.checked;
      start(0).catch(report);
      if (options.onChange) options.onChange(api.getOptions());
    };
    reset.onclick = function () {
      pitch = 0;
      reversed = false;
      pitchInput.value = pitchRange.value = 0;
      reverseInput.checked = false;
      start(0).catch(report);
      if (options.onChange) options.onChange(api.getOptions());
    };
    canvas.onpointerdown = function (event) {
      if (!ready) return;
      var rect = canvas.getBoundingClientRect(),
        next = Math.max(
          0,
          Math.min(buffer.duration, ((event.clientX - rect.left) / rect.width) * buffer.duration),
        );
      if (playing) start(next).catch(report);
      else {
        offset = next;
        update();
      }
    };
    canvas.onkeydown = function (event) {
      if (!ready || ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) return;
      event.preventDefault();
      var next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buffer.duration
            : position() + (event.key === 'ArrowLeft' ? -0.1 : 0.1);
      next = Math.max(0, Math.min(buffer.duration, next));
      if (playing) start(next).catch(report);
      else {
        offset = next;
        update();
      }
    };
    function renderWav() {
      if (!ready || destroyed)
        return Promise.reject(new Error('먼저 오디오 미리듣기를 불러오세요.'));
      var Offline = scope.OfflineAudioContext || scope.webkitOfflineAudioContext;
      if (!Offline)
        return Promise.reject(
          new Error('이 환경에서는 오디오 변형 내보내기를 사용할 수 없습니다.'),
        );
      var rate = playbackRate(pitch),
        renderFrames = Math.ceil(buffer.length / rate),
        offline = new Offline(buffer.numberOfChannels, renderFrames, buffer.sampleRate),
        node = offline.createBufferSource(),
        exportPitch = pitch,
        exportReverse = reversed;
      node.buffer = currentBuffer();
      node.playbackRate.value = rate;
      node.connect(offline.destination);
      node.start();
      return offline.startRendering().then(function (rendered) {
        var channels = [];
        for (var i = 0; i < rendered.numberOfChannels; i++)
          channels.push(rendered.getChannelData(i));
        return {
          bytes: encodeWav(channels, rendered.sampleRate),
          sampleRate: rendered.sampleRate,
          channels: rendered.numberOfChannels,
          frames: rendered.length,
          duration: rendered.duration,
          pitchShift: exportPitch,
          reverse: exportReverse,
          previewGainExcluded: true,
        };
      });
    }
    var api = {
      prepareRender: function () { return Promise.resolve(loadWave(false)); },
      renderWav: renderWav,
      getOptions: function () {
        return { pitchShift: pitch, reverse: reversed };
      },
      getState: function () {
        return {
          ready: ready,
          playing: playing,
          currentTime: position(),
          duration: buffer ? buffer.duration : 0,
          pitchShift: pitch,
          reverse: reversed,
          volume: volume,
          muted: muted,
        };
      },
      pause: function () {
        stop();
        basic.pause();
      },
      setActive: function (active) {
        if (!active) {
          pausedByActivity = pausedByActivity || playing;
          basicPausedByActivity = basicPausedByActivity || !basic.paused;
          if (playing) stop();
          basic.pause();
        } else {
          if (pausedByActivity) {
            pausedByActivity = false;
            start().catch(report);
          }
          if (basicPausedByActivity) {
            basicPausedByActivity = false;
            var p = basic.play();
            if (p && p.catch) p.catch(report);
          }
        }
      },
      destroy: function () {
        if (destroyed) return;
        stop();
        destroyed = true;
        controller.abort();
        clearInterval(timer);
        basic.pause();
        basic.removeAttribute('src');
        basic.load();
        if (context) context.close().catch(function () {});
        if (activePlayer === api) activePlayer = null;
        holder.remove();
      },
    };
    holder.__contentriumAudio = api;
    update();
    return api;
  }
  var api = {
    mount: mount,
    encodeWav: encodeWav,
    playbackRate: playbackRate,
    basicOnly: basicOnly,
    reverseChannels: reverseChannels,
    envelope: envelope,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumAudio = api;
})(typeof window === 'undefined' ? globalThis : window);
