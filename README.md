# 엄마 영어교실

엄마를 위한 영어 공부 웹앱입니다. 매일 새벽 GitHub Actions가 Gemini 무료 API로 새 수업(문장 6개 + 단어 5개)을 하나씩 만들어 추가하고, GitHub Pages로 배포합니다.

- 앱 주소: https://neohj87.github.io/mom-english/
- 30단계 커리큘럼(레벨 1~3): `data/curriculum.json`
- 수업 데이터: `data/lessons.json` (자동으로 쌓임)
- 생성 스크립트: `scripts/generate.mjs`
- 자동 실행: `.github/workflows/daily.yml` (매일 한국시간 04:17)

## 처음 설정 (한 번만)

1. **Gemini API 키 넣기**: Settings → Secrets and variables → Actions → New repository secret
   - Name: `GEMINI_API_KEY` / Value: Google AI Studio에서 받은 키
2. **Pages 켜기**: Settings → Pages → Source를 **GitHub Actions**로 선택
3. **처음 한 번 실행**: Actions 탭 → "매일 새 수업 만들고 배포" → Run workflow

모델을 바꾸려면 Settings → Secrets and variables → Actions → Variables 에 `GEMINI_MODEL` 을 추가하세요 (기본값 `gemini-2.5-flash`).

## 수업이 만들어지는 방식

- 수업 수가 가장 적은 단계부터 채웁니다. 30단계를 한 바퀴 돈 뒤에는 1단계부터 새 문장으로 두 번째 수업을 만듭니다.
- 이미 나온 문장·단어는 다시 나오지 않게 걸러냅니다.
- 하루에 한 번만 만들어집니다. 직접 하나 더 만들려면 로컬에서 `FORCE=1 GEMINI_API_KEY=... node scripts/generate.mjs`.
- 수업이 잘못 만들어졌다면 `data/lessons.json` 에서 그 수업을 지우거나 고치면 됩니다.

## 공부 기록

진도, 연속 공부 일수, 아는 단어는 엄마 휴대폰 브라우저에만 저장됩니다. 휴대폰에서 앱 주소를 연 뒤 "홈 화면에 추가"를 하면 앱처럼 쓸 수 있어요.
