using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Win32;

[assembly: AssemblyTitle("Contentrium Preset")]
[assembly: AssemblyProduct("Contentrium Preset")]
[assembly: AssemblyCompany("Contentrium")]
[assembly: AssemblyDescription("Contentrium Preset Windows Installer")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

namespace ContentriumPreset {
    public sealed class Options {
        public bool Test, Silent, SilentTest, Uninstall, IgnoreHost, FailPlacement, FailRegistryRestore, HoldUninstall;
        public int CleanupParent;
        public string Manifest, Package, Target, Offline;
        public static Options Parse(string[] args) {
            var o = new Options();
            for (int i = 0; i < args.Length; i++) {
                string a = args[i];
                if (a == "--test-mode") o.Test = true;
                else if (a == "--silent") o.Silent = true;
                else if (a == "--silent-test") { o.Silent = true; o.SilentTest = true; }
                else if (a == "--uninstall" || a == "/uninstall") o.Uninstall = true;
                else if (a == "--test-ignore-running-host") o.IgnoreHost = true;
                else if (a == "--test-fail-after-placement") o.FailPlacement = true;
                else if (a == "--test-fail-registry-restore") o.FailRegistryRestore = true;
                else if (a == "--test-hold-after-uninstall") o.HoldUninstall = true;
                else if (a == "--cleanup-owned-install") {
                    if (++i >= args.Length || !Int32.TryParse(args[i], out o.CleanupParent) || o.CleanupParent <= 0) throw new ArgumentException("유효한 제거 부모 프로세스가 필요합니다.");
                }
                else if (a == "--manifest" || a == "--package" || a == "--target" || a == "--offline-directory") {
                    if (++i >= args.Length) throw new ArgumentException("옵션 값이 없습니다: " + a);
                    if (a == "--manifest") o.Manifest = Path.GetFullPath(args[i]);
                    if (a == "--package") o.Package = Path.GetFullPath(args[i]);
                    if (a == "--target") o.Target = Path.GetFullPath(args[i]);
                    if (a == "--offline-directory") o.Offline = Path.GetFullPath(args[i]);
                } else throw new ArgumentException("알 수 없는 옵션: " + a);
            }
            if (!o.Test && (o.SilentTest || o.IgnoreHost || o.FailPlacement || o.FailRegistryRestore || o.HoldUninstall || o.Manifest != null || o.Package != null || o.Target != null))
                throw new ArgumentException("로컬 파일·대상 지정은 --test-mode에서만 사용할 수 있습니다.");
            if (o.Test && (o.Target == null || (!o.Uninstall && o.CleanupParent == 0 && o.Offline == null && (o.Manifest == null || o.Package == null))))
                throw new ArgumentException("테스트 설치에는 --manifest, --package, --target이 필요합니다.");
            return o;
        }
    }

    public sealed class ReleaseManifest {
        public int schemaVersion { get; set; }
        public string product { get; set; }
        public string version { get; set; }
        public string asset { get; set; }
        public string sha256 { get; set; }
        public long size { get; set; }
        public string extensionId { get; set; }
    }

    // Every redirect is validated before its request, and no downloaded program is executed.
    public sealed class SafeClient : WebClient {
        public long Limit = 512L * 1024 * 1024;
        protected override WebRequest GetWebRequest(Uri uri) {
            Installer.CheckHttps(uri);
            var request = (HttpWebRequest)base.GetWebRequest(uri);
            request.AllowAutoRedirect = false;
            request.Timeout = 60000;
            request.ReadWriteTimeout = 60000;
            request.UserAgent = "Contentrium-Preset-Setup/1.0";
            return request;
        }
        protected override WebResponse GetWebResponse(WebRequest request) {
            return Follow(request, (HttpWebResponse)request.GetResponse());
        }
        protected override WebResponse GetWebResponse(WebRequest request, IAsyncResult result) {
            return Follow(request, (HttpWebResponse)request.EndGetResponse(result));
        }
        WebResponse Follow(WebRequest request, HttpWebResponse response) {
            for (int redirect = 0; redirect < 8; redirect++) {
                int code = (int)response.StatusCode;
                if (code >= 300 && code < 400) {
                    string location = response.Headers["Location"];
                    Uri next = new Uri(response.ResponseUri, location);
                    response.Close();
                    Installer.CheckHttps(next);
                    var follow = (HttpWebRequest)WebRequest.Create(next);
                    follow.AllowAutoRedirect = false;
                    follow.Timeout = 60000;
                    follow.ReadWriteTimeout = 60000;
                    follow.UserAgent = "Contentrium-Preset-Setup/1.0";
                    request = follow;
                    response = (HttpWebResponse)request.GetResponse();
                    continue;
                }
                if (response.ContentLength > Limit) { response.Close(); throw new InvalidDataException("다운로드 크기 제한을 초과했습니다."); }
                return response;
            }
            throw new InvalidDataException("다운로드 주소 변경 횟수를 초과했습니다.");
        }
    }

    public sealed class Installer {
        public const string Product = "Contentrium Preset", Id = "com.contentrium.preset";
        const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ContentriumPreset";
        const long MaxArchive = 512L * 1024 * 1024, MaxUnpacked = 1536L * 1024 * 1024;
        public readonly Options Options;
        public readonly string CepRoot, Extension, ProgramDir, MenuDir;
        readonly Action<string, int> Progress;
        readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        readonly string MutexName;

        public Installer(Options options, Action<string, int> progress) {
            Options = options; Progress = progress;
            CepRoot = Path.GetFullPath(options.Test ? options.Target : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Adobe\CEP\extensions"));
            Extension = Path.Combine(CepRoot, Id);
            ProgramDir = options.Test ? Path.Combine(CepRoot, ".test-program", Product) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", Product);
            MenuDir = options.Test ? Path.Combine(CepRoot, ".test-start-menu", Product) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", Product);
            Json.MaxJsonLength = 1024 * 1024;
            using (var hash = SHA256.Create()) MutexName = "Global\\ContentriumPreset-" + BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(CepRoot.TrimEnd('\\').ToUpperInvariant()))).Replace("-", "").Substring(0, 24);
        }
        void ProductLock(Action action, bool wait) {
            using (var mutex = new Mutex(false, MutexName)) {
                bool entered = false;
                try {
                    try { entered = wait ? mutex.WaitOne() : mutex.WaitOne(0); }
                    catch (AbandonedMutexException) { entered = true; }
                    if (!entered) throw new IOException("다른 Contentrium Preset 설치 또는 제거가 진행 중입니다. 완료 후 다시 시도해 주세요.");
                    action();
                } finally { if (entered) mutex.ReleaseMutex(); }
            }
        }

        void HostClosed() {
            if (!(Options.Test && Options.IgnoreHost) && Process.GetProcessesByName("AfterFX").Length > 0)
                throw new InvalidOperationException("After Effects를 닫은 후 다시 시도해 주세요. 작업 중인 프로젝트를 먼저 저장해 주세요.");
        }
        public static void CheckHttps(Uri uri) {
            string host = uri.DnsSafeHost.ToLowerInvariant();
            if (uri.Scheme != "https" || uri.Port != 443 || uri.UserInfo.Length != 0 ||
                !(host == "api.github.com" || host == "github.com" || host == "release-assets.githubusercontent.com" || host == "objects.githubusercontent.com"))
                throw new InvalidDataException("허용되지 않은 다운로드 주소입니다.");
        }
        static string AssetUrl(Dictionary<string, object> release, string name) {
            var assets = (System.Collections.IEnumerable)release["assets"];
            var asset = assets.Cast<object>().Select(a => a as Dictionary<string, object>).SingleOrDefault(a => a != null && Convert.ToString(a["name"]) == name);
            if (asset == null) throw new InvalidDataException("최신 배포 파일을 찾을 수 없습니다: " + name);
            string url = Convert.ToString(asset["browser_download_url"]);
            var uri = new Uri(url); CheckHttps(uri);
            string prefix = "/contentriumkorea/contentrium-preset/releases/download/";
            if (uri.Host != "github.com" || !uri.AbsolutePath.StartsWith(prefix, StringComparison.Ordinal) ||
                !uri.AbsolutePath.EndsWith("/" + name, StringComparison.Ordinal) || uri.Query.Length != 0 || uri.Fragment.Length != 0)
                throw new InvalidDataException("제품 저장소의 배포 파일 주소가 아닙니다.");
            return url;
        }
        ReleaseManifest ReadManifest(string text) {
            ReleaseManifest m = Json.Deserialize<ReleaseManifest>(text);
            if (m == null || m.schemaVersion != 1 || m.product != Product || m.extensionId != Id || m.asset != "Portable.zip" ||
                !Regex.IsMatch(m.sha256 ?? "", "^[a-fA-F0-9]{64}$") || !Regex.IsMatch(m.version ?? "", "^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$") || m.size <= 0 || m.size > MaxArchive)
                throw new InvalidDataException("배포 확인 파일의 형식 또는 제품 정보가 올바르지 않습니다.");
            return m;
        }
        static string HashFile(string file) {
            using (var stream = File.OpenRead(file)) using (var sha = SHA256.Create())
                return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }
        void Download(string url, string file, long size) {
            using (var client = new SafeClient()) using (var done = new ManualResetEvent(false)) {
                client.Limit = size;
                Exception failure = null;
                client.DownloadProgressChanged += delegate(object sender, DownloadProgressChangedEventArgs e) {
                    if (e.BytesReceived > size) client.CancelAsync();
                    Progress("설치 파일 다운로드 중…", Math.Max(5, Math.Min(60, 5 + (int)(55 * e.BytesReceived / Math.Max(size, 1)))));
                };
                client.DownloadFileCompleted += delegate(object sender, AsyncCompletedEventArgs e) {
                    failure = e.Cancelled ? new OperationCanceledException("다운로드가 취소되었거나 크기 제한을 초과했습니다.") : e.Error;
                    done.Set();
                };
                client.DownloadFileAsync(new Uri(url), file);
                if (!done.WaitOne(TimeSpan.FromMinutes(20))) { client.CancelAsync(); throw new TimeoutException("다운로드 시간이 초과되었습니다. 다시 시도해 주세요."); }
                if (failure != null) throw new InvalidOperationException("다운로드에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.", failure);
            }
        }

        public static void ExtractSafe(string archive, string root) {
            string absoluteRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long total = 0;
            using (var zip = ZipFile.OpenRead(archive)) {
                if (zip.Entries.Count > 20000) throw new InvalidDataException("압축 파일 개수 제한을 초과했습니다.");
                foreach (var entry in zip.Entries) {
                    string name = entry.FullName.Replace('\\', '/');
                    bool directory = name.EndsWith("/", StringComparison.Ordinal);
                    string[] pieces = name.TrimEnd('/').Split('/');
                    if (pieces.Length == 0 || pieces.Any(p => p.Length == 0 || p == "." || p == ".." || p.TrimEnd(' ', '.') != p ||
                        p.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || Regex.IsMatch(p, "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\.|$)", RegexOptions.IgnoreCase)) || Path.IsPathRooted(name) ||
                        ((entry.ExternalAttributes >> 16) & 0xF000) == 0xA000)
                        throw new InvalidDataException("안전하지 않은 압축 경로입니다: " + name);
                    string destination = Path.GetFullPath(Path.Combine(root, Path.Combine(pieces)));
                    if (!destination.StartsWith(absoluteRoot, StringComparison.OrdinalIgnoreCase) || !names.Add(destination))
                        throw new InvalidDataException("중복되거나 대상 폴더를 벗어나는 압축 경로입니다.");
                    total = checked(total + entry.Length);
                    if (entry.Length > 128L * 1024 * 1024 || total > MaxUnpacked)
                        throw new InvalidDataException("압축 해제 크기 제한을 초과했습니다.");
                    if (directory) { Directory.CreateDirectory(destination); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    using (var input = entry.Open()) using (var output = new FileStream(destination, FileMode.CreateNew)) {
                        byte[] buffer = new byte[65536]; long copied = 0; int count;
                        while ((count = input.Read(buffer, 0, buffer.Length)) > 0) {
                            copied += count;
                            if (copied > entry.Length) throw new InvalidDataException("압축 파일의 선언된 크기와 실제 크기가 다릅니다.");
                            output.Write(buffer, 0, count);
                        }
                        if (copied != entry.Length) throw new InvalidDataException("압축 파일이 완전하지 않습니다.");
                    }
                }
            }
        }
        static void ValidatePayload(string payload, string expectedVersion = null) {
            string manifest = Path.Combine(payload, @"CSXS\manifest.xml");
            var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
            using (var reader = XmlReader.Create(manifest, settings)) {
                var xml = XDocument.Load(reader);
                if (xml.Root == null || (string)xml.Root.Attribute("ExtensionBundleId") != Id ||
                    !xml.Descendants("Extension").Any(e => (string)e.Attribute("Id") == Id))
                    throw new InvalidDataException("CEP 제품 식별자가 올바르지 않습니다.");
                string version = (string)xml.Root.Attribute("ExtensionBundleVersion");
                if (String.IsNullOrEmpty(version) || (expectedVersion != null && version != expectedVersion) ||
                    !xml.Descendants("ExtensionList").Elements("Extension").Any(e => (string)e.Attribute("Id") == Id && (string)e.Attribute("Version") == version))
                    throw new InvalidDataException("CEP 패널과 패키지 버전이 일치하지 않습니다.");
            }
            if (!File.Exists(Path.Combine(payload, "index.html"))) throw new InvalidDataException("패널 시작 파일이 없습니다.");
        }
        static void OwnedDirectory(string dir) {
            if (Directory.Exists(dir) && (File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("설치 대상은 바로가기 또는 연결 폴더일 수 없습니다.");
        }
        static void RemoveOwned(string dir, string expectedParent) {
            if (!Directory.Exists(dir)) return;
            string resolved = Path.GetFullPath(dir);
            if (!resolved.StartsWith(Path.GetFullPath(expectedParent).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))
                throw new IOException("제거 대상 폴더가 허용된 위치를 벗어났습니다.");
            OwnedDirectory(dir);
            // Reject links anywhere below the owned folder; never follow another product's path.
            foreach (string child in Directory.GetDirectories(dir)) { OwnedDirectory(child); RemoveOwned(child, dir); }
            foreach (string file in Directory.GetFiles(dir)) File.Delete(file);
            Directory.Delete(dir);
        }
        static string BackupName(string dir) { return dir + ".backup-" + Guid.NewGuid().ToString("N"); }
        void CreateShortcut(string filename, string exe, string args) {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { filename });
            Type type = shortcut.GetType();
            type.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { exe });
            type.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { args });
            type.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shortcut);
            System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
        }
        Dictionary<string, object> RegistrySnapshot() {
            var result = new Dictionary<string, object>();
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(UninstallKey)) {
                if (key != null) foreach (string name in key.GetValueNames()) result[name] = key.GetValue(name);
            }
            return result;
        }
        void RestoreRegistry(Dictionary<string, object> old) {
            if (Options.Test) {
                if (Options.FailRegistryRestore) throw new IOException("TEST: registry restore access denied");
                return;
            }
            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
            if (old.Count > 0) using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey)) foreach (var item in old) key.SetValue(item.Key, item.Value);
        }
        Dictionary<string, object> DebugSnapshot() {
            var result = new Dictionary<string, object>();
            foreach (string version in new[] { "11", "12" }) using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Adobe\CSXS." + version)) result[version] = key == null ? null : key.GetValue("PlayerDebugMode");
            return result;
        }
        void RestoreDebug(Dictionary<string, object> old) {
            if (Options.Test) {
                if (Options.FailRegistryRestore) throw new IOException("TEST: CEP setting restore access denied");
                return;
            }
            foreach (var item in old) using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Adobe\CSXS." + item.Key)) {
                if (item.Value == null) key.DeleteValue("PlayerDebugMode", false); else key.SetValue("PlayerDebugMode", item.Value);
            }
        }
        void Register(string version, long size) {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey)) {
                key.SetValue("DisplayName", Product); key.SetValue("DisplayVersion", version);
                key.SetValue("Publisher", "Contentrium"); key.SetValue("InstallLocation", ProgramDir);
                key.SetValue("UninstallString", "\"" + Path.Combine(ProgramDir, "Uninstall.exe") + "\" --uninstall");
                key.SetValue("DisplayIcon", Path.Combine(ProgramDir, "Uninstall.exe"));
                key.SetValue("URLInfoAbout", "https://github.com/contentriumkorea/contentrium-preset");
                key.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, size / 1024), RegistryValueKind.DWord);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord); key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
            // User-scope CEP permits this unsigned public panel; other installed panels stay intact.
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Adobe\CSXS.11")) key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Adobe\CSXS.12")) key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
        }
        public void Install() { ProductLock(InstallCore, false); }
        void InstallCore() {
            HostClosed(); Progress(Options.Offline == null ? "최신 버전 확인 중…" : "오프라인 패키지 확인 중…", 0);
            string temp = Path.Combine(Path.GetTempPath(), "ContentriumPreset-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temp);
            string staging = null, programStaging = null, menuStaging = null;
            string extensionBackup = null, programBackup = null, menuBackup = null;
            bool extensionPlaced = false, programPlaced = false, menuPlaced = false, registryTouched = false;
            Dictionary<string, object> oldRegistry = null, oldDebug = null;
            try {
                ReleaseManifest manifest; string archive = null, extracted;
                if (Options.Offline != null) {
                    extracted = Options.Offline;
                    string infoFile = Path.Combine(extracted, "package-info.json");
                    var info = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(infoFile, Encoding.UTF8));
                    if (Convert.ToString(info["product"]) != Product || Convert.ToString(info["extensionId"]) != Id || Convert.ToInt32(info["schemaVersion"]) != 1)
                        throw new InvalidDataException("오프라인 패키지의 제품 정보가 올바르지 않습니다.");
                    var fileHashes = (Dictionary<string, object>)info["files"];
                    foreach (string candidate in Directory.GetFiles(extracted, "*", SearchOption.AllDirectories)) {
                        string relative = candidate.Substring(Path.GetFullPath(extracted).TrimEnd('\\').Length + 1).Replace('\\', '/');
                        if (relative != "package-info.json" && !fileHashes.ContainsKey(relative)) throw new InvalidDataException("확인 목록에 없는 오프라인 파일입니다: " + relative);
                    }
                    foreach (var item in fileHashes) {
                        string file = Path.GetFullPath(Path.Combine(extracted, item.Key.Replace('/', Path.DirectorySeparatorChar)));
                        if (!file.StartsWith(Path.GetFullPath(extracted).TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase) || !HashFile(file).Equals(Convert.ToString(item.Value), StringComparison.OrdinalIgnoreCase))
                            throw new InvalidDataException("오프라인 패키지 확인에 실패했습니다: " + item.Key);
                    }
                    manifest = new ReleaseManifest { schemaVersion = 1, product = Product, version = Convert.ToString(info["version"]), extensionId = Id, asset = "Portable.zip", sha256 = HashFile(infoFile), size = new FileInfo(infoFile).Length };
                    ReadManifest(Json.Serialize(manifest));
                }
                else if (Options.Test) { manifest = ReadManifest(File.ReadAllText(Options.Manifest, Encoding.UTF8)); archive = Options.Package; extracted = Path.Combine(temp, "package"); }
                else {
                    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                    Dictionary<string, object> latest;
                    using (var client = new SafeClient()) { client.Limit = 1024 * 1024; latest = Json.Deserialize<Dictionary<string, object>>(client.DownloadString("https://api.github.com/repos/contentriumkorea/contentrium-preset/releases/latest")); }
                    if (latest.ContainsKey("draft") && Convert.ToBoolean(latest["draft"])) throw new InvalidDataException("공개 배포 버전이 아닙니다.");
                    string text;
                    using (var client = new SafeClient()) { client.Limit = 1024 * 1024; text = client.DownloadString(AssetUrl(latest, "release-manifest.json")); }
                    manifest = ReadManifest(text);
                    string tag = Convert.ToString(latest["tag_name"]);
                    if (tag != manifest.version && tag != "v" + manifest.version) throw new InvalidDataException("배포 태그와 패키지 버전이 일치하지 않습니다.");
                    archive = Path.Combine(temp, "Portable.zip"); Download(AssetUrl(latest, manifest.asset), archive, manifest.size);
                    extracted = Path.Combine(temp, "package");
                }
                Progress("파일 무결성 확인 중…", 62);
                if (archive != null) {
                    if (new FileInfo(archive).Length != manifest.size || !HashFile(archive).Equals(manifest.sha256, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("설치 파일의 크기 또는 SHA-256 확인에 실패했습니다. 설치하지 않았습니다.");
                    Directory.CreateDirectory(extracted); ExtractSafe(archive, extracted);
                }
                var packageInfo = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(extracted, "package-info.json"), Encoding.UTF8));
                if (Convert.ToString(packageInfo["version"]) != manifest.version || Convert.ToString(packageInfo["product"]) != Product || Convert.ToString(packageInfo["extensionId"]) != Id || Convert.ToInt32(packageInfo["schemaVersion"]) != 1)
                    throw new InvalidDataException("오프라인 패키지와 배포 확인 파일의 버전 또는 제품 정보가 일치하지 않습니다.");
                string payload = Path.Combine(extracted, Id); ValidatePayload(payload, manifest.version);
                HostClosed(); Progress("기존 설치를 보존하고 새 버전 설치 중…", 78);
                Directory.CreateDirectory(CepRoot); Directory.CreateDirectory(Path.GetDirectoryName(ProgramDir)); Directory.CreateDirectory(Path.GetDirectoryName(MenuDir));
                OwnedDirectory(CepRoot); OwnedDirectory(Extension); OwnedDirectory(ProgramDir); OwnedDirectory(MenuDir);
                if (Directory.Exists(Extension)) ValidatePayload(Extension);
                if (Directory.Exists(ProgramDir)) {
                    string receipt = Path.Combine(ProgramDir, "install-receipt.json");
                    var existing = File.Exists(receipt) ? Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(receipt, Encoding.UTF8)) : null;
                    if (existing == null || Convert.ToString(existing["product"]) != Product || Convert.ToString(existing["extensionId"]) != Id)
                        throw new IOException("기존 프로그램 폴더의 소유 정보를 확인할 수 없습니다. 파일을 보존하고 설치를 중단했습니다.");
                }
                staging = Path.Combine(CepRoot, ".contentrium-staging-" + Guid.NewGuid().ToString("N"));
                CopyTree(payload, staging);
                string installationId = Guid.NewGuid().ToString("N");
                File.WriteAllText(Path.Combine(staging, ".contentrium-install.json"), Json.Serialize(new { product = Product, extensionId = Id, version = manifest.version, packageSha256 = manifest.sha256, installationId = installationId }), Encoding.UTF8);
                programStaging = ProgramDir + ".staging-" + Guid.NewGuid().ToString("N"); Directory.CreateDirectory(programStaging);
                File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(programStaging, "Uninstall.exe"));
                string help = "<html lang='ko'><meta charset='utf-8'><title>Contentrium Preset</title><style>body{font:16px sans-serif;max-width:900px;margin:40px auto;line-height:1.7}pre{white-space:pre-wrap}</style><h1>Contentrium Preset</h1><pre>" +
                    WebUtility.HtmlEncode(File.Exists(Path.Combine(extracted, @"docs\user-guide.md")) ? File.ReadAllText(Path.Combine(extracted, @"docs\user-guide.md"), Encoding.UTF8) : "After Effects의 창 > 확장 > Contentrium Preset에서 패널을 여세요.") + "</pre></html>";
                File.WriteAllText(Path.Combine(programStaging, "UserGuide.html"), help, Encoding.UTF8);
                File.WriteAllText(Path.Combine(programStaging, "install-receipt.json"), Json.Serialize(new { product = Product, extensionId = Id, version = manifest.version, extensionPath = Extension, installationId = installationId }), Encoding.UTF8);
                menuStaging = MenuDir + ".staging-" + Guid.NewGuid().ToString("N"); Directory.CreateDirectory(menuStaging);
                File.WriteAllText(Path.Combine(menuStaging, "Contentrium Preset - 사용 안내.url"), "[InternetShortcut]\r\nURL=" + new Uri(Path.Combine(ProgramDir, "UserGuide.html")).AbsoluteUri + "\r\n", Encoding.UTF8);
                if (!Options.Test) CreateShortcut(Path.Combine(menuStaging, "Contentrium Preset 제거.lnk"), Path.Combine(ProgramDir, "Uninstall.exe"), "--uninstall");
                if (Directory.Exists(Extension)) { extensionBackup = BackupName(Extension); Directory.Move(Extension, extensionBackup); }
                if (Directory.Exists(ProgramDir)) { programBackup = BackupName(ProgramDir); Directory.Move(ProgramDir, programBackup); }
                if (Directory.Exists(MenuDir)) { menuBackup = BackupName(MenuDir); Directory.Move(MenuDir, menuBackup); }
                Directory.Move(staging, Extension); extensionPlaced = true;
                if (Options.FailPlacement) throw new IOException("TEST: injected failure after CEP placement");
                Directory.Move(programStaging, ProgramDir); programPlaced = true;
                Directory.Move(menuStaging, MenuDir); menuPlaced = true;
                if (Options.Test && Options.FailRegistryRestore) { registryTouched = true; throw new IOException("TEST: registration failure with denied restoration"); }
                if (!Options.Test) { oldRegistry = RegistrySnapshot(); oldDebug = DebugSnapshot(); registryTouched = true; Register(manifest.version, manifest.size); }
                Progress("설치 완료. After Effects에서 Contentrium Preset을 열어 주세요.", 100);
                // Cleanup failure must not undo an already successful installation.
                foreach (string backup in new[] { extensionBackup, programBackup, menuBackup }) if (backup != null) { try { RemoveOwned(backup, Path.GetDirectoryName(backup)); } catch { } }
            } catch (Exception error) {
                var restoreErrors = new List<string>();
                Action<string, Action> restore = delegate(string step, Action operation) { try { operation(); } catch (Exception failure) { restoreErrors.Add(step + ": " + failure.Message); } };
                if (registryTouched) {
                    restore("앱 등록 복구", delegate { RestoreRegistry(oldRegistry); });
                    restore("Adobe 설정 복구", delegate { RestoreDebug(oldDebug); });
                }
                if (menuPlaced) restore("새 시작 메뉴 정리", delegate { RemoveOwned(MenuDir, Path.GetDirectoryName(MenuDir)); });
                if (programPlaced) restore("새 프로그램 정리", delegate { RemoveOwned(ProgramDir, Path.GetDirectoryName(ProgramDir)); });
                if (extensionPlaced) restore("새 CEP 패널 정리", delegate { RemoveOwned(Extension, CepRoot); });
                if (menuBackup != null && Directory.Exists(menuBackup)) restore("시작 메뉴 복구", delegate { Directory.Move(menuBackup, MenuDir); });
                if (programBackup != null && Directory.Exists(programBackup)) restore("프로그램 복구", delegate { Directory.Move(programBackup, ProgramDir); });
                if (extensionBackup != null && Directory.Exists(extensionBackup)) restore("CEP 패널 복구", delegate { Directory.Move(extensionBackup, Extension); });
                if (restoreErrors.Count > 0) throw new IOException(error.Message + "\r\n복구 중 일부 단계에 문제가 발생했습니다:\r\n" + String.Join("\r\n", restoreErrors), error);
                if (error is WebException) throw new InvalidOperationException("최신 버전을 확인하지 못했습니다. 인터넷 연결과 공개 배포 상태를 확인하고 다시 시도해 주세요.", error);
                throw;
            } finally {
                foreach (string leftover in new[] { staging, programStaging, menuStaging, temp }) if (leftover != null) { try { RemoveOwned(leftover, Path.GetDirectoryName(leftover)); } catch { } }
            }
        }
        static void CopyTree(string source, string destination) {
            OwnedDirectory(source); Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source)) { if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new IOException("연결 파일은 설치할 수 없습니다."); File.Copy(file, Path.Combine(destination, Path.GetFileName(file))); }
            foreach (string directory in Directory.GetDirectories(source)) CopyTree(directory, Path.Combine(destination, Path.GetFileName(directory)));
        }
        public void Uninstall() { ProductLock(UninstallCore, false); }
        void UninstallCore() {
            HostClosed(); Progress("Contentrium Preset 제거 중…", 10);
            OwnedDirectory(Extension); OwnedDirectory(ProgramDir); OwnedDirectory(MenuDir);
            if (Directory.Exists(ProgramDir)) {
                string receipt = Path.Combine(ProgramDir, "install-receipt.json");
                if (!File.Exists(receipt)) throw new IOException("프로그램 폴더 소유 정보를 확인할 수 없습니다. 자동 제거하지 않았습니다.");
                var record = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(receipt, Encoding.UTF8));
                if (Convert.ToString(record["product"]) != Product || Convert.ToString(record["extensionId"]) != Id) throw new IOException("프로그램 폴더의 제품 정보가 일치하지 않습니다.");
            }
            if (Directory.Exists(Extension)) {
                string marker = Path.Combine(Extension, ".contentrium-install.json");
                if (!File.Exists(marker)) throw new IOException("이 설치 프로그램이 설치한 폴더인지 확인할 수 없습니다. 자동 제거하지 않았습니다.");
                var ownership = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(marker, Encoding.UTF8));
                if (Convert.ToString(ownership["product"]) != Product || Convert.ToString(ownership["extensionId"]) != Id) throw new IOException("제품 소유 정보가 일치하지 않습니다.");
                RemoveOwned(Extension, CepRoot);
            }
            if (Directory.Exists(MenuDir)) RemoveOwned(MenuDir, Path.GetDirectoryName(MenuDir));
            if (!Options.Test) Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
            if (Directory.Exists(ProgramDir)) {
                string running = Assembly.GetExecutingAssembly().Location;
                // Windows holds the running image open: delete all owned files except this image.
                foreach (string directory in Directory.GetDirectories(ProgramDir)) RemoveOwned(directory, ProgramDir);
                foreach (string file in Directory.GetFiles(ProgramDir)) if (!Path.GetFullPath(file).Equals(Path.GetFullPath(running), StringComparison.OrdinalIgnoreCase) && Path.GetFileName(file) != "install-receipt.json") File.Delete(file);
                if (Path.GetFullPath(running).StartsWith(ProgramDir + "\\", StringComparison.OrdinalIgnoreCase)) {
                    LaunchCleanup(running);
                } else RemoveOwned(ProgramDir, Path.GetDirectoryName(ProgramDir));
            }
            Progress("Contentrium Preset을 제거했습니다. 다른 Adobe 확장은 보존됩니다.", 100);
        }
        void LaunchCleanup(string running) {
            string helperDir = Path.Combine(Path.GetTempPath(), "ContentriumPreset-Cleanup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(helperDir);
            string helper = Path.Combine(helperDir, "Cleanup.exe"); File.Copy(running, helper);
            int pid = Process.GetCurrentProcess().Id;
            var receipt = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(ProgramDir, "install-receipt.json"), Encoding.UTF8));
            string generation = Convert.ToString(receipt["installationId"]); Guid valid;
            if (!Guid.TryParse(generation, out valid)) throw new IOException("설치 세대 식별자가 올바르지 않습니다.");
            File.WriteAllText(Path.Combine(helperDir, "cleanup-request.json"), Json.Serialize(new { product = Product, extensionId = Id, programDir = ProgramDir, extensionPath = Extension, parentPid = pid, installationId = generation }), Encoding.UTF8);
            string args = "--cleanup-owned-install " + pid;
            if (Options.Test) args += " --test-mode --target \"" + CepRoot + "\"";
            var process = Process.Start(new ProcessStartInfo(helper, args) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
            string ready = Path.Combine(helperDir, "ready"); DateTime deadline = DateTime.UtcNow.AddSeconds(10);
            while (!File.Exists(ready) && !process.HasExited && DateTime.UtcNow < deadline) Thread.Sleep(25);
            if (!File.Exists(ready)) throw new IOException("제거 후처리를 준비하지 못했습니다. 다시 시도해 주세요.");
        }
        public void CleanupOwned() {
            string helperDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string tempRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd('\\') + "\\";
            if (!Path.GetFullPath(helperDir).StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(helperDir).StartsWith("ContentriumPreset-Cleanup-", StringComparison.Ordinal)) throw new IOException("제거 후처리 위치가 올바르지 않습니다.");
            var request = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(helperDir, "cleanup-request.json"), Encoding.UTF8));
            if (Convert.ToString(request["product"]) != Product || Convert.ToString(request["extensionId"]) != Id || Convert.ToInt32(request["parentPid"]) != Options.CleanupParent ||
                !Path.GetFullPath(Convert.ToString(request["programDir"])).Equals(Path.GetFullPath(ProgramDir), StringComparison.OrdinalIgnoreCase) ||
                !Path.GetFullPath(Convert.ToString(request["extensionPath"])).Equals(Path.GetFullPath(Extension), StringComparison.OrdinalIgnoreCase)) throw new IOException("제거 요청의 소유 정보가 일치하지 않습니다.");
            var receipt = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(ProgramDir, "install-receipt.json"), Encoding.UTF8));
            if (Convert.ToString(receipt["product"]) != Product || Convert.ToString(receipt["extensionId"]) != Id ||
                !Path.GetFullPath(Convert.ToString(receipt["extensionPath"])).Equals(Path.GetFullPath(Extension), StringComparison.OrdinalIgnoreCase) ||
                Convert.ToString(receipt["installationId"]) != Convert.ToString(request["installationId"])) throw new IOException("프로그램 소유 정보가 일치하지 않습니다.");
            using (var parent = Process.GetProcessById(Options.CleanupParent)) {
                string parentFile = Path.GetFullPath(parent.MainModule.FileName);
                if (!parentFile.Equals(Path.Combine(ProgramDir, "Uninstall.exe"), StringComparison.OrdinalIgnoreCase)) throw new IOException("제거 부모 프로세스가 제품 제거 프로그램이 아닙니다.");
                File.WriteAllText(Path.Combine(helperDir, "ready"), "ready");
                parent.WaitForExit();
            }
            // Wait without owning the mutex: the parent still owns it until Uninstall returns.
            ProductLock(delegate {
                string marker = Path.Combine(ProgramDir, "install-receipt.json");
                if (!File.Exists(marker)) return;
                var current = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(marker, Encoding.UTF8));
                if (Convert.ToString(current["product"]) != Product || Convert.ToString(current["extensionId"]) != Id ||
                    Convert.ToString(current["installationId"]) != Convert.ToString(request["installationId"]) ||
                    !Path.GetFullPath(Convert.ToString(current["extensionPath"])).Equals(Path.GetFullPath(Extension), StringComparison.OrdinalIgnoreCase)) return;
                RemoveOwned(ProgramDir, Path.GetDirectoryName(ProgramDir));
            }, true);
            File.Delete(Path.Combine(helperDir, "cleanup-request.json"));
            File.Delete(Path.Combine(helperDir, "ready"));
            // The running 38KB helper can remain in OS Temp; installed program files are removed.
        }
    }

    public sealed class SetupForm : Form {
        readonly Label status = new Label(), details = new Label();
        readonly ProgressBar progress = new ProgressBar();
        readonly Button action = new Button();
        readonly Options options;
        bool working, complete;
        public bool Succeeded { get { return complete; } }
        public SetupForm(Options o) {
            options = o; Text = Installer.Product; ClientSize = new Size(520, 285); Font = new Font("Malgun Gothic", 10);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen;
            var title = new Label { Text = o.Uninstall ? "Contentrium Preset 제거" : "Contentrium Preset 설치", Font = new Font("Malgun Gothic", 17, FontStyle.Bold), Bounds = new Rectangle(24, 20, 480, 40) };
            details.Text = o.Uninstall ? "Contentrium Preset을 제거합니다.\r\nAfter Effects를 닫은 뒤 제거 버튼을 눌러 주세요." :
                (o.Offline == null ? "최신 버전을 다운로드하고 현재 사용자 계정에 설치합니다." : "포함된 오프라인 패키지를 현재 사용자 계정에 설치합니다.") + "\r\nAfter Effects를 닫은 뒤 설치 버튼을 눌러 주세요.";
            details.Bounds = new Rectangle(24, 72, 474, 60);
            progress.Bounds = new Rectangle(24, 149, 472, 20);
            status.Bounds = new Rectangle(24, 181, 472, 48); status.Text = "준비되었습니다.";
            action.Bounds = new Rectangle(368, 235, 128, 32); action.Text = o.Uninstall ? "제거" : "설치";
            action.Click += delegate { if (complete) Close(); else Start(); };
            Controls.AddRange(new Control[] { title, details, progress, status, action });
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (working) e.Cancel = true; };
        }
        void UpdateProgress(string message, int value) {
            if (IsDisposed) return;
            BeginInvoke((Action)delegate { status.Text = message; progress.Value = Math.Max(0, Math.Min(100, value)); });
        }
        void Start() {
            working = true; action.Enabled = false;
            Task.Run(delegate {
                try {
                    var installer = new Installer(options, UpdateProgress);
                    if (options.Uninstall) installer.Uninstall(); else installer.Install();
                    BeginInvoke((Action)delegate { complete = true; working = false; action.Enabled = true; action.Text = "닫기"; });
                } catch (Exception error) {
                    BeginInvoke((Action)delegate { working = false; action.Enabled = true; action.Text = "다시 시도"; status.Text = error.Message; progress.Value = 0; MessageBox.Show(this, error.Message, Installer.Product, MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                }
            });
        }
    }

    internal static class Program {
        [STAThread]
        static int Main(string[] args) {
            try {
                if (args.Contains("--silent") || args.Contains("--silent-test")) {
                    Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
                    Console.SetError(new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true });
                }
                Options options = Options.Parse(args);
                if (options.CleanupParent > 0) { new Installer(options, delegate { }).CleanupOwned(); return 0; }
                if (options.Silent) {
                    var installer = new Installer(options, delegate(string message, int value) { Console.WriteLine(value + "% " + message); });
                    if (options.Uninstall) installer.Uninstall(); else installer.Install();
                    if (options.Test && options.HoldUninstall && options.Uninstall) {
                        File.WriteAllText(Path.Combine(options.Target, "uninstall-waiting"), "ready");
                        DateTime limit = DateTime.UtcNow.AddSeconds(30);
                        while (!File.Exists(Path.Combine(options.Target, "release-uninstaller")) && DateTime.UtcNow < limit) Thread.Sleep(50);
                    }
                    return 0;
                }
                Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                var form = new SetupForm(options); Application.Run(form); return form.Succeeded ? 0 : 2;
            } catch (Exception error) {
                Console.Error.WriteLine(args.Contains("--test-mode") ? error.ToString() : error.Message);
                if (!args.Contains("--silent") && !args.Contains("--silent-test") && !args.Contains("--cleanup-owned-install")) MessageBox.Show(error.Message, Installer.Product, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
