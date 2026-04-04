# 이어서 작업하기

## 현재 상태
퀴즈 시스템 전체 구현 완료. 동작 확인됨.

## 미구현 — 문법 오류 DB
작문(3단계) 정답 시 문법 오류 발견되면 `[등록] [넘어가기]` 버튼이 노출되는데,
현재 `grammar:register` 콜백은 버튼만 있고 구현 안 됨 (placeholder).

### 구현할 내용
1. Notion 문법 DB 생성 (컬럼: 오류패턴 | 예시 | 단계 | 등록일 | 다음리뷰일)
2. `config.py` — `NOTION_GRAMMAR_DATABASE_ID` 추가
3. `notion_service.py` — 문법 CRUD 추가
4. `text_handler.py` — `grammar:register` 콜백 구현
5. 퀴즈 풀에 grammar_db 합류 (추후)

