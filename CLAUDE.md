# Redash 개발 가이드

## 주의사항 (필독!)

**`yarn build` 사용 금지! 10분 이상 소요됨**

- 프론트엔드 수정 시에는 **반드시 `yarn watch` 만 사용**
- `yarn watch` 실행 중이면 파일 수정 시 자동으로 몇 초 내에 재빌드됨
- 빌드 결과물(`client/dist/`, `node_modules/`)은 볼륨 마운트로 Windows에 저장되므로 컨테이너 삭제해도 유지됨

## 로컬 개발 환경

### 서버 실행
```bash
docker compose up -d
```
- 접속 URL: http://localhost:5050
- 이메일 테스트: http://localhost:1080

### 프론트엔드 개발 (중요!)

**첫 실행 시에만 빌드:**
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "c:/work/redash:/app" -w /app node:18-bookworm yarn build
```

**이후 개발 시에는 watch 모드만 사용:**
```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "c:/work/redash:/app" -w /app node:18-bookworm yarn watch
```
- 파일 수정 시 자동 재빌드 (몇 초 소요)
- 브라우저 새로고침으로 확인

### 서버 재시작
```bash
docker compose restart server scheduler worker
```

## AI Query Generation 기능

### 설정 방법
1. Settings > AI Query Generation 에서 Enable
2. Anthropic API Key 입력
3. 또는 `.env` 파일에 설정:
   ```
   REDASH_AI_QUERY_GENERATION_ENABLED=true
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### 관련 파일
- Frontend: `client/app/components/queries/AIQueryGenerator.jsx`
- Backend: `redash/handlers/ai_query.py`
- Settings UI: `client/app/pages/settings/components/AISettings/`
