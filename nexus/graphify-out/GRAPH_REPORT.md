# Graph Report - .  (2026-04-13)

## Corpus Check
- Corpus is ~10,543 words - fits in a single context window. You may not need a graph.

## Summary
- 249 nodes · 300 edges · 27 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `Nexus Project` - 15 edges
2. `TestExtractVideoId` - 9 edges
3. `_call_with_models()` - 8 edges
4. `TestGetPlatform` - 8 edges
5. `_send_next_quiz()` - 7 edges
6. `TestParseResponse` - 7 edges
7. `_k()` - 6 edges
8. `_handle_quiz_answer()` - 6 edges
9. `_get_transcript_native()` - 6 edges
10. `_make_response()` - 6 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Hyperedges (group relationships)
- **AI/LLM Client Libraries** — requirements_anthropic, requirements_google_genai, requirements_groq [INFERRED 0.85]
- **FastAPI Web Server Stack** — requirements_fastapi, requirements_uvicorn, requirements_pydantic_settings [INFERRED 0.90]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (27): _build_github_prompt(), _build_url_prompt(), _build_youtube_prompt(), _call_claude(), _call_gemini(), _call_gemini_url(), _call_with_models(), explain_word() (+19 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (8): notion_service 단위 테스트 — Notion API mock 사용., TestAddWord, TestDeletePage, TestExists, TestExistsWord, TestGetWordsDue, TestSave, TestUpdateWordStage

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (18): add_word(), delete_page(), exists(), exists_word(), get_all_words(), get_words_due(), parse_word_page(), 영단어를 Notion DB에 저장하고 page_id 반환. (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.24
Nodes (14): handle_callback(), _handle_quiz_answer(), handle_text(), _handle_word_query(), _k(), 다음 충돌 항목 질문 또는 등록 버튼 표시., 퀴즈 답변 채점 후 결과 전송 및 다음 문제 출제., 다음 문제 출제. 세션의 mode에 따라 자동출제/전체퀴즈 구분. (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (9): _make_response(), github_service 단위 테스트 — 실제 HTTP 요청 없이 requests를 mock., _readme_response(), test_404_raises(), test_rate_limit_raises(), test_success_no_readme(), test_success_with_readme(), TestGetRepoInfo (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (16): anthropic, APScheduler, beautifulsoup4, fastapi, google-genai, groq, Nexus Project, notion-client >=3.0.0 (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.24
Nodes (12): Exception, _extract_video_id(), get_transcript(), _get_transcript_native(), _get_transcript_whisper(), 자막 없음 — 영상 자체에 자막이 없는 경우., 네트워크 차단 — 현재 실행 환경(AWS 등)에서 YouTube 접근이 막힌 경우., youtube_transcript_api 우선 → 차단/자막없음 시 yt-dlp + Whisper 폴백. (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (9): 남은 퀴즈 있으면 이어서 출제. 완료 시 스킵., 일시정지 10분 후 — 퀴즈 재개 여부 확인 메시지 전송., 일시정지 시 호출 — 10분 후 재개 알림 단발 job 등록., due 단어 조회 후 퀴즈 문제 출제. 공통 로직., resume_daily_quiz(), schedule_quiz_resume(), _send_quiz_question(), _send_resume_prompt() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (2): youtube_service._extract_video_id 단위 테스트 — 외부 호출 없음., TestExtractVideoId

### Community 9 - "Community 9"
Cohesion: 0.2
Nodes (2): url_handler._get_platform 단위 테스트 — 외부 의존 없음., TestGetPlatform

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (8): get_grammar_due(), parse_grammar_page(), 문법 오류를 Notion grammar DB에 저장하고 page_id 반환., 오늘 리뷰할 grammar 항목 반환., Notion grammar 페이지에서 속성 추출., 퀴즈 결과에 따라 단계와 다음리뷰일 업데이트., save_grammar_error(), update_grammar_stage()

### Community 11 - "Community 11"
Cohesion: 0.44
Nodes (7): call_model(), main(), print_result(), 모델 가용성 및 품질 테스트. url_context 브라우징 + quiz 함수(explain_word, generate_quiz stage 1/, run_quiz(), run_url_context(), section()

### Community 12 - "Community 12"
Cohesion: 0.33
Nodes (8): fetch_all_sorted(), fetch_with_filter(), main(), parse(), print_results(), 실제 Notion DB 조회 디버그 스크립트. 날짜를 입력받아 get_words_due() 결과를 출력합니다.  실행 방법 (nexus/ 디렉토, data_sources.query + on_or_before 필터 (현재 get_words_due 방식)., data_sources.query + 필터 없이 날짜 오름차순 (현재 get_all_words 방식).

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (2): ai_service._parse_response 단위 테스트 — 외부 API 호출 없음., TestParseResponse

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (7): _build_headers(), get_repo_info(), _parse_github_url(), _parse_rate_limit(), X-RateLimit-Reset 헤더에서 남은 초 계산. 없으면 3600 반환., 다양한 GitHub URL 형태에서 (owner, repo) 추출.     예) https://github.com/user/repo/tree/, GitHub API로 레포 메타데이터 + README 병렬 조회.      URL → parse → (GET /repos/{owner}/{r

### Community 15 - "Community 15"
Cohesion: 0.39
Nodes (7): _make_response(), webpage_service.get_content 단위 테스트 — requests mock 사용., test_basic_text_extraction(), test_long_text_truncated(), test_nav_footer_removed(), test_script_style_removed(), TestGetContent

### Community 16 - "Community 16"
Cohesion: 0.57
Nodes (6): _get_platform(), _handle_generic(), _handle_github(), handle_url(), _log_failure(), 처리 실패 시 Notion에 오류 로그 저장.

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (3): BaseSettings, Config, Settings

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (3): _extract_short_error(), 전체 테스트 실행 스크립트 — nexus/ 디렉토리에서 실행: python run_tests.py, traceback 에서 마지막 2줄(원인 줄 + 예외 메시지)만 추출.

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (1): DRAFT 로그 래퍼 - 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록 - 구현 완료 후에도 코드에 유지 (주석 역할 겸용)  활성화: .

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): handle_quiz_command(), /quiz 명령어 — 카운트 초기화 후 즉시 첫 문제 출제.

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **63 isolated node(s):** `DRAFT 로그 래퍼 - 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록 - 구현 완료 후에도 코드에 유지 (주석 역할 겸용)  활성화: .`, `Config`, `전체 테스트 실행 스크립트 — nexus/ 디렉토리에서 실행: python run_tests.py`, `traceback 에서 마지막 2줄(원인 줄 + 예외 메시지)만 추출.`, `due 단어 조회 후 퀴즈 문제 출제. 공통 로직.` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 21`** (2 nodes): `main()`, `main.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `refresh_handler.py`, `handle_refresh()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `webpage_service.py`, `get_content()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `DRAFT 로그 래퍼 - 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록 - 구현 완료 후에도 코드에 유지 (주석 역할 겸용)  활성화: .`, `Config`, `전체 테스트 실행 스크립트 — nexus/ 디렉토리에서 실행: python run_tests.py` to the rest of the system?**
  _63 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._