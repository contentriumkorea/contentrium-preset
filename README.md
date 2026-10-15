# Contentrium Preset

After Effects에서 사용하는 프리셋 패널입니다. 43개 프리셋과 110개 변형을 탐색하고 미리보기한 뒤 레이어에 적용·편집할 수 있습니다. 검증 환경은 Windows 11, After Effects 2026(26.5)입니다.

| 다운로드 | 설치 방식 |
| --- | --- |
| [설치 버전 · Setup.exe](https://github.com/contentriumkorea/contentrium-preset/releases/latest/download/Setup.exe) | 최신 버전을 다운로드하고 전체 설치 |
| [포터블·오프라인 · Portable.zip](https://github.com/contentriumkorea/contentrium-preset/releases/latest/download/Portable.zip) | 전체 패키지를 압축 해제하고 Install.cmd로 오프라인 설치 |

## 설치

1. 작업을 저장하고 After Effects를 닫습니다.
2. [최신 배포](https://github.com/contentriumkorea/contentrium-preset/releases/latest)의 `Setup.exe`를 실행합니다.
3. **설치**를 누릅니다. 최신 패키지 다운로드, 확인, 설치가 자동으로 진행됩니다.
4. After Effects를 다시 열고 **창 → 확장 → Contentrium Preset**에서 패널을 엽니다.

관리자 권한은 필요하지 않습니다. 현재 사용자 계정에 설치되며, Windows 설정의 **앱 → 설치된 앱**에서 제거할 수 있습니다. 시작 메뉴의 **Contentrium Preset → 사용 안내**에서도 안내를 볼 수 있습니다.

## 업데이트

작업을 저장하고 After Effects를 닫은 뒤 `Setup.exe`를 다시 실행하고 **설치**를 누릅니다. 최신 버전으로 업데이트되며, 기존 개인 즐겨찾기는 유지됩니다. 업데이트에 실패하면 이전 설치를 복구합니다.

## 포터블·오프라인 패키지

`Setup.exe`는 설치 버튼을 누르면 최신 버전을 자동으로 다운로드하고 설치합니다. `Portable.zip`에는 오프라인 설치에 필요한 패널과 설치 프로그램이 모두 포함되어 있습니다.

`Portable.zip`을 모두 압축 해제하고 `Install.cmd`를 실행합니다. 포함된 설치 프로그램에서 **설치**를 누르면 인터넷 연결 없이 사용자 CEP 폴더 등록, 프로그램 설치, Windows 앱 등록까지 진행됩니다. 압축 파일 안에서 바로 실행하지 마세요.

이 제품은 After Effects 안에서 사용하는 CEP 확장 패널입니다. 포터블 패키지도 호스트 등록과 After Effects가 필요하며, 독립 실행형 편집 앱으로 실행되지는 않습니다.

## 사용

**Browse**에서 카테고리·검색·즐겨찾기로 프리셋을 고릅니다. 변형을 선택하고 **In / Out / Both** 또는 **Apply**를 누릅니다. **Edit**에서 선택한 레이어의 컨트롤을 조정합니다. 애니메이션 미리보기는 프리셋의 움직임을 보여주는 대표 예시이며, 선택 레이어의 실제 렌더 결과는 내용과 크기에 따라 달라집니다.

[자세한 사용 안내](docs/user-guide.md)

![Contentrium Preset Browse](docs/browse.png)

## 개발과 검증

런타임은 별도 패키지 설치 없이 After Effects의 CEP 패널로 실행됩니다. 소스 확인용 명령은 `npm test`, `npm run verify`입니다. 설치 프로그램 소스는 `installer`, 배포 패키징 스크립트는 `packaging`에 있습니다.

개발·검증 명령은 소스 저장소를 내려받은 프로젝트 루트에서 실행합니다.

Windows PowerShell에서 `./packaging/build-release.ps1 -Version 1.0.0`을 실행하면 설치 파일과 포터블 패키지를 함께 생성합니다.

[검증 결과와 지원 범위](docs/verification.md) · [MIT 라이선스](LICENSE)

## 설치 파일 확인

`release-manifest.json`에는 `Portable.zip`의 파일 크기와 SHA-256이 포함됩니다. 설치 프로그램은 제품 저장소의 HTTPS 배포 파일을 확인한 뒤 설치하며, 다른 CEP 확장은 유지합니다. 업데이트 실패 시 기존 설치를 복구합니다.

설치 프로그램은 Microsoft .NET Framework가 포함된 Windows에서 실행됩니다.
