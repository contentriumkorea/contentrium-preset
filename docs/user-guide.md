# Contentrium Preset 사용 안내

43개 프리셋과 110개 변형을 제공하는 After Effects용 패널입니다. 검증 환경은 Windows 11, After Effects 2026(26.5)입니다.

설치 전에 작업을 저장하고 After Effects를 닫으세요. Setup.exe에서 설치를 누르면 최신 버전을 다운로드하고 현재 사용자 계정에 설치합니다. 포터블·오프라인 패키지 Portable.zip은 모든 파일을 압축 해제한 뒤 Install.cmd로 오프라인 전체 설치할 수 있습니다. 두 방식 모두 After Effects 안에서 사용하는 CEP 패널을 등록합니다.

After Effects를 열고 창 → 확장 → Contentrium Preset에서 패널을 여세요. 메뉴 이름은 Adobe 버전에 따라 확장(레거시)으로 표시될 수 있습니다.

Browse에서 왼쪽 카테고리를 펼치거나 검색어를 입력하세요. 별표로 개인 즐겨찾기를 관리하고, 썸네일 크기를 조절할 수 있습니다. 카드를 선택하면 그 카드 안에 변형 목록이 펼쳐집니다. 예를 들어 From End와 From Start 중 하나를 선택하면 하단에도 같은 변형 이름이 표시됩니다. View all at once를 누르면 모든 변형을 별도 카드로 비교할 수 있습니다. Back으로 원래 목록에 돌아옵니다.

적용할 레이어를 선택하고 In, Out, Both 또는 Apply를 누르세요. 프리셋마다 적용 방식과 지원되는 레이어가 다릅니다. 하단에 표시된 변형이 적용 대상입니다. 110개 변형의 미리보기는 자체 제작한 산·호수 A 장면과 도시·달 B 장면을 After Effects에서 렌더한 무음 클립입니다. 화면 밖의 영상은 멈추고 다시 보이면 재생합니다. 선택 레이어의 실시간 렌더 기능은 아닙니다.

Edit에서 선택한 레이어의 지원되는 수치, 색상, 위치, 시간 등의 컨트롤을 조정하세요. 지원되지 않는 작업은 오류 메시지로 안내되며, 성공한 것으로 표시하지 않습니다.

## 타이틀 기본 글꼴

타이틀의 기본 모양에는 아래 Montserrat 글꼴이 사용됩니다. 글꼴 파일은 패키지에 포함되지 않으며 설치 프로그램도 글꼴을 설치하지 않습니다. 기본 모양을 사용하려면 해당 스타일이 설치되어 있어야 합니다.

| 타이틀 | 기본 스타일 | Edit의 Font에 표시되는 이름 |
| --- | --- | --- |
| 1-Line Basic Title 1 · 4개 변형 | Montserrat ExtraBold | `Montserrat-ExtraBold` |
| 2-Line Basic Title 2 · 첫 줄 | Montserrat Black | `Montserrat-Black` |
| 2-Line Basic Title 2 · 둘째 줄 | Montserrat Bold | `Montserrat-Bold` |
| 3-Line Basic Title 2 - Center · 세 줄 | Montserrat ExtraBold | `Montserrat-ExtraBold` |

Edit의 Font에서 설치된 다른 글꼴의 PostScript 이름으로 바꿀 수 있습니다. 다른 글꼴을 사용하면 글자 폭과 줄 배치가 달라질 수 있습니다. 필요한 글꼴이 없을 때 이 패널이 특정 글꼴로 대체하지는 않으며, After Effects의 글꼴 대체 동작을 따릅니다. 모션·텍스트 프리셋은 선택한 레이어의 글꼴을 사용합니다.

## 개인 오디오 라이브러리

효과음 파일은 배포 패키지에 포함되지 않습니다. 개인 오디오 라이브러리는 Windows의 `%APPDATA%\Contentrium\Preset\UserAudio` 폴더를 사용합니다. 이 폴더는 프로그램·CEP 설치 폴더와 별개이므로 업데이트하거나 프로그램을 제거해도 유지됩니다.

패널 상단의 **Audio**를 누르면 폴더 경로와 `library.json` 예시를 복사할 수 있습니다. 필요한 효과음이 없으면 적용 후 상태줄과 Edit 탭에 미등록 안내가 나타납니다. 이 경우 영상 효과는 적용되지만 해당 인스턴스에는 누락된 소리가 없습니다.

1. 탐색기 주소창에 위 경로를 입력하고 폴더가 없으면 만듭니다.
2. 사용할 WAV, AIF, AIFF 또는 MP3 파일을 이 폴더에 넣습니다. 파일명은 `my-transition.wav`처럼 영문·숫자로 시작하고 영문·숫자·공백·점·밑줄·하이픈을 사용하세요.
3. 같은 폴더에 UTF-8 `library.json`을 만들고 프리셋의 오디오 키와 파일명을 연결합니다.

```json
{
  "schemaVersion": 1,
  "assets": {
    "transition-basic-05": "my-transition.wav"
  }
}
```

지원되는 오디오 키는 `bass-approach-01`, `bass-bend-01`, `slow-motion-17`, `slowdown-06`, `slowdown-07`, `swoosh-transition-03`, `swoosh-wood-01-minus24`, `transition-basic-05`, `transition-basic-09`, `transition-complex-11`, `transition-complex-14`입니다. 파일명은 해당 폴더 안의 파일만 지정합니다. 등록되지 않은 파일은 해당 효과음 없이 영상 효과를 적용합니다. 오디오를 사용하는 프리셋은 Edit의 Sound와 Volume 컨트롤로 조정할 수 있습니다.

파일을 등록한 뒤 프리셋을 다시 적용하면 효과음을 함께 가져옵니다. 이미 적용한 인스턴스에는 자동으로 추가되지 않습니다.

설치 오류가 나오면 After Effects를 닫았는지, 인터넷 연결이 되는지 확인하고 다시 시도하세요. 파일 확인에 실패한 경우 설치가 진행되지 않습니다. 업데이트 도중 실패하면 이전 설치가 복구됩니다.

제거하려면 Windows 설정 → 앱 → 설치된 앱 → Contentrium Preset → 제거를 선택하세요. After Effects를 먼저 닫아 주세요. 다른 Adobe 확장은 보존됩니다. 개인 즐겨찾기는 별도 사용자 저장소에 남을 수 있습니다.

## 명령줄 설치·제거

자동화할 때는 Setup.exe에 `--silent`를 지정할 수 있습니다. 기본 실행은 설치 GUI를 엽니다. 무인 설치도 같은 최신 버전 조회·파일 확인·전체 설치와 AE 실행 중 중단 규칙을 사용합니다.

- 온라인 설치·업데이트: `Setup.exe --silent`
- 오프라인 전체 설치: `Setup.exe --silent --offline-directory "Portable.zip을 모두 압축 해제한 폴더"`
- 설치된 프로그램 제거: `Uninstall.exe --silent --uninstall`

성공 종료 코드는 0, 오류는 1이며, 무인 모드에서는 오류 대화상자 대신 stderr로 안내합니다. PowerShell에서는 `Start-Process -Wait -PassThru`로 실행 완료와 ExitCode를 확인하세요. 개인 오디오 폴더는 제거하지 않습니다.
