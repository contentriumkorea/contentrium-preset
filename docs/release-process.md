# Contentrium Preset 배포 절차

프로젝트 루트에서 실행하는 Windows PowerShell 명령입니다. 제품 저장소는 `contentriumkorea/contentrium-preset`, 이번 태그는 `v1.1.1`입니다. 이미 존재하는 저장소를 사용합니다.

## 소스 확정과 패키지 준비

실제 After Effects의 적용·편집·Undo, 렌더와 미리보기 검사를 마친 뒤 소스를 확정합니다. 1.1.1 전체 검증 결과와 최종 파일 크기는 확인한 뒤 문서에 반영합니다. 개인 오디오는 사용자 라이브러리에 두고 패키지에 넣지 않습니다.

```powershell
node .\tools\build-preview-profiles.cjs
npm test
npm run verify
.\packaging\test-release-validation.ps1
.\packaging\build-release.ps1 -Version 1.1.1
.\installer\test-installer.ps1 -Setup .\packaging\out\Setup.exe
.\installer\test-silent.ps1 -Setup .\packaging\out\Setup.exe
Get-FileHash -Algorithm SHA256 -LiteralPath .\packaging\out\Setup.exe, .\packaging\out\Portable.zip, .\packaging\out\release-manifest.json
```

`packaging/out`에 Setup.exe, Portable.zip, release-manifest.json이 생성됩니다. 이전 후보의 해시를 재사용하지 않습니다. JSX를 바꾼 뒤에는 프로필 JSON을 다시 생성합니다.

외부 release-manifest의 버전·ZIP 크기·SHA-256, 내부 package-info의 전체 파일 목록·SHA-256을 대조합니다. package.json, CEP manifest의 두 버전, 카탈로그, package-info 및 릴리스 태그가 1.1.1으로 일치해야 합니다. renderedPreview가 지정된 모든 클립이 실제 패키지에 있고 재생되는지 확인합니다.

README가 연결하는 LICENSE, 사용 안내, 검증 문서와 패널 스크린샷을 포함합니다. 런타임·문서에 개인 절대 경로, 계정 정보, 로컬 서버 주소나 임시 검증 자료가 없어야 합니다. ZIP에 개발용 tests, installer, packaging, tools, 저장소 관리 폴더가 포함되지 않는지 확인합니다.

최종 ZIP을 별도 폴더에 압축 해제하고 After Effects를 닫은 상태에서 오프라인 전체 설치를 검사합니다. GUI는 Install.cmd를 사용하고, 무인 검사는 포함된 Setup.exe의 `--silent --offline-directory "압축 해제 폴더"`를 사용합니다. Windows 앱 등록·시작 메뉴·제거 프로그램·설치된 파일 해시와 기존 즐겨찾기·UserAudio 보존을 확인합니다.

## 소스와 태그 게시

```powershell
git status --short
git add CSXS assets docs jsx library tools tests package.json index.html panel.js panel.css preview.js README.md installer packaging Install.cmd install.ps1 .gitignore LICENSE
git diff --cached --name-only
git diff --cached --stat
git diff --cached --check
git commit -m "Publish Contentrium Preset 1.1.1"
git push origin main
git tag -a v1.1.1 -m "Contentrium Preset 1.1.1"
git push origin v1.1.1
```

게시 전에 staged 파일 목록을 검토합니다. packaging/out, 설치·렌더 검증 기록, 개인 효과음 파일은 Git에 포함하지 않습니다. 태그가 가리키는 커밋은 최종 런타임 소스와 같아야 합니다.

## 배포 파일 게시

```powershell
gh release create v1.1.1 .\packaging\out\Setup.exe .\packaging\out\Portable.zip .\packaging\out\release-manifest.json --repo contentriumkorea/contentrium-preset --verify-tag --latest --title "Contentrium Preset 1.1.1" --notes-file .\docs\release-notes.md
```

세 파일의 이름을 유지합니다. 설치 프로그램은 최신 공개 배포에서 release-manifest.json과 Portable.zip을 조회합니다. 초안이나 사전 배포는 최신 공개 버전으로 자동 설치되는지 확인하는 시험을 대신하지 않습니다.

## 게시 후 온라인 설치 확인

최신 링크의 Setup.exe를 받아 After Effects를 닫고 설치를 누르거나 `--silent`로 실행합니다. 1.1.1 자동 조회·다운로드·확인·재설치, Windows 앱 등록과 파일 해시, 즐겨찾기·UserAudio 보존을 확인합니다. 무인 실행에서는 종료 코드와 stdout/stderr도 기록합니다. AE를 재시작하고 패널 연결·선택 변형 적용·Edit·Undo와 실제 미리보기 재생을 확인합니다.

실제 확인한 뒤 검증 문서와 릴리스 설명에 결과를 반영합니다. 확인 전에는 온라인 설치나 전체 시각 검증을 통과했다고 기록하지 않습니다. 문서만 보완하려고 이미 게시한 코드 태그를 옮기지 않습니다.
