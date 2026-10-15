# Contentrium Preset 1.1.1

After Effects용 프리셋 패널입니다. 43개 프리셋과 110개 변형을 제공합니다.

- 선택한 카드 안에서 변형을 고를 수 있습니다. View all at once로 변형을 별도 카드로 비교하고 Back으로 돌아갑니다.
- 선택한 변형 이름과 In / Out / Both 적용 대상을 함께 유지합니다.
- 개체 애니메이션은 투명 로고 PNG, 텍스트·타이틀은 배경 이미지 없는 글자, 장면 전환은 보라·청록과 코럴·골드의 서로 다른 A/B 장면으로 보여줍니다. 화면 밖의 미리보기 영상은 일시정지합니다.
- 모션·텍스트와 타이틀·도형·카메라의 애니메이션 및 편집 컨트롤을 개선했습니다.
- 개인 오디오 라이브러리를 설치 폴더 밖에서 사용합니다. 효과음 파일은 배포 패키지에 포함하지 않습니다.

## 다운로드

| 파일 | 용도 |
| --- | --- |
| [Setup.exe](https://github.com/contentriumkorea/contentrium-preset/releases/download/v1.1.1/Setup.exe) | 설치 버튼을 누르면 최신 버전 다운로드·확인·전체 설치 |
| [Portable.zip](https://github.com/contentriumkorea/contentrium-preset/releases/download/v1.1.1/Portable.zip) | 전체 패키지를 압축 해제한 뒤 Install.cmd로 오프라인 전체 설치 |
| [release-manifest.json](https://github.com/contentriumkorea/contentrium-preset/releases/download/v1.1.1/release-manifest.json) | Portable.zip의 파일 크기와 SHA-256 |

설치 전 After Effects를 닫아 주세요. 설치 후 **창 → 확장 → Contentrium Preset**에서 패널을 엽니다. 기존 사용자는 Setup.exe를 다시 실행해 업데이트할 수 있습니다. 개인 즐겨찾기와 별도 UserAudio 폴더는 유지됩니다.

포터블·오프라인 패키지도 After Effects 호스트 등록이 필요한 CEP 패널입니다. 독립 실행형 편집 앱은 아닙니다. 검증 환경은 Windows 11, After Effects 2026(26.5)입니다. 미리보기는 선택 레이어의 실시간 렌더 기능이 아닙니다.

[사용 안내](https://github.com/contentriumkorea/contentrium-preset/blob/main/docs/user-guide.md) · [검증 기록과 지원 범위](https://github.com/contentriumkorea/contentrium-preset/blob/main/docs/verification.md)

## 배포 확인

Setup.exe는 45,568바이트, 전체 Portable.zip은 13,570,161바이트입니다. 110개 AE 미리보기 렌더와 브라우저 재생, 코드 검사 74개, 설치 파일 검사 16+7개와 메타데이터 검사 4개를 통과했습니다. 실제 사용자 경로의 오프라인 설치 및 공개 최신 링크를 사용하는 온라인 설치를 확인했고, 두 설치 모두 런타임 127개 파일의 해시가 일치했습니다. 설치된 엔진의 대표 5종 적용·컨트롤 변경/복구·제거 등 38개 항목도 통과했습니다. 온라인 설치는 `--silent` 경로로 검증했습니다.
