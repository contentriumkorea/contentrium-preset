# Contentrium Preset 배포 절차

프로젝트 루트에서 실행하는 Windows PowerShell 명령입니다. 제품 저장소는 `contentriumkorea/contentrium-preset`, 첫 버전 태그는 `v1.0.0`입니다.

## 최종 패키지 준비

네이티브 CEP 패널의 적용·편집·Undo 검사를 마친 뒤 런타임 소스를 확정합니다. 실제로 확인한 결과만 검증 문서에 반영합니다. 공개 최신 배포에서 다운로드하는 온라인 설치는 배포 생성 후 검사합니다.

```powershell
npm test
npm run verify
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\packaging\build-release.ps1 -Version 1.0.0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\test-installer.ps1 -Setup .\packaging\out\Setup.exe
Get-FileHash -Algorithm SHA256 -LiteralPath .\packaging\out\Setup.exe, .\packaging\out\Portable.zip, .\packaging\out\release-manifest.json
```

`packaging/out`에 `Setup.exe`, `Portable.zip`, `release-manifest.json`이 생성됩니다. 이전 후보의 해시를 새 빌드 결과에 사용하지 않습니다.

`Portable.zip` 내부 `package-info.json`의 파일 목록·SHA-256, 실제 ZIP의 파일 목록·SHA-256을 대조합니다. 외부 `release-manifest.json`의 ZIP 크기·SHA-256을 확인하고, 배포 버전·패키지 정보·CEP manifest·카탈로그 버전이 모두 `1.0.0`인지 확인합니다.

README가 연결하는 LICENSE, 사용 안내, 검증 문서, 패널 스크린샷이 포함되어야 합니다. 런타임과 문서에는 개인 절대 경로, 계정 정보, 로컬 서버 주소, 검증용 임시 자료가 없어야 합니다. ZIP에는 개발용 tests, installer, packaging, tools, 저장소 관리 폴더가 포함되지 않습니다.

최종 ZIP을 별도 폴더에 압축 해제하고 `Install.cmd`로 실제 오프라인 GUI 설치를 확인합니다. After Effects를 닫은 상태에서 설치하고, Windows 앱 등록·시작 메뉴·제거 프로그램·설치된 런타임 해시를 확인합니다.

## 소스와 태그 게시

아래 명령은 첫 저장소와 첫 릴리스를 생성할 때 사용합니다. 기존 원격 저장소나 태그가 있으면 그 상태를 확인하고, 새 저장소 생성 명령을 중복 실행하지 않습니다.

```powershell
git status --short
git add .
git diff --cached --stat
git diff --cached --check
git commit -m "Publish Contentrium Preset 1.0.0"
gh repo create contentriumkorea/contentrium-preset --public --source . --remote origin --push --description "After Effects preset panel"
git tag -a v1.0.0 -m "Contentrium Preset 1.0.0"
git push origin v1.0.0
```

원격 저장소가 이미 있고 로컬 origin만 없다면 새 저장소를 만드는 대신 다음 두 명령으로 연결합니다.

```powershell
git remote add origin https://github.com/contentriumkorea/contentrium-preset.git
git push -u origin main
```

태그가 가리키는 커밋은 최종 런타임 소스와 일치해야 합니다. `packaging/out`과 로컬 검증 기록은 Git에 포함하지 않습니다.

## 배포 파일 게시

```powershell
gh release create v1.0.0 .\packaging\out\Setup.exe .\packaging\out\Portable.zip .\packaging\out\release-manifest.json --repo contentriumkorea/contentrium-preset --verify-tag --latest --title "Contentrium Preset 1.0.0" --notes-file .\docs\release-notes.md
```

세 파일의 이름을 유지합니다. 설치 프로그램은 최신 공개 배포에서 `release-manifest.json`과 `Portable.zip`을 조회합니다. 태그 이름은 manifest 버전 그대로 또는 앞에 `v`를 붙인 형태여야 합니다. 초안이나 사전 배포는 최신 공개 버전을 조회하는 실제 설치 시험을 대신하지 않습니다.

## 게시 후 온라인 설치 확인

최신 다운로드 링크에서 Setup.exe를 받아 After Effects를 닫고 **설치**를 누릅니다. 최신 버전 조회, 실제 다운로드, 파일 확인, 재설치가 끝나는지 확인합니다. Windows 앱 등록과 런타임 해시, 기존 즐겨찾기 보존, 재시작한 CEP 패널의 연결과 기본 동작을 확인합니다.

온라인 검사 결과는 확인한 뒤 검증 문서와 릴리스 설명에 반영합니다. 확인 전에는 온라인 설치 검사가 완료되었다고 기록하지 않습니다. 문서 보완만으로 이미 게시한 코드 태그를 다시 가리키게 하지 않습니다.
