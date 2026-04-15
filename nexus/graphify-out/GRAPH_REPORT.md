# Graph Report - nexus  (2026-04-15)

## Corpus Check
- 31 files · ~13,631 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 266 nodes · 356 edges · 28 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI Prompt Builders|AI Prompt Builders]]
- [[_COMMUNITY_Quiz Handler Flow|Quiz Handler Flow]]
- [[_COMMUNITY_Notion Service Tests|Notion Service Tests]]
- [[_COMMUNITY_Notion Service Core|Notion Service Core]]
- [[_COMMUNITY_GitHub Service Tests|GitHub Service Tests]]
- [[_COMMUNITY_YouTube Service|YouTube Service]]
- [[_COMMUNITY_YouTube Service Tests|YouTube Service Tests]]
- [[_COMMUNITY_Quiz Scheduler|Quiz Scheduler]]
- [[_COMMUNITY_URL Handler Tests|URL Handler Tests]]
- [[_COMMUNITY_Grammar Service|Grammar Service]]
- [[_COMMUNITY_Debug Model CLI|Debug Model CLI]]
- [[_COMMUNITY_Debug Words Due|Debug Words Due]]
- [[_COMMUNITY_AI Service Tests|AI Service Tests]]
- [[_COMMUNITY_GitHub Service Core|GitHub Service Core]]
- [[_COMMUNITY_Webpage Service Tests|Webpage Service Tests]]
- [[_COMMUNITY_URL Handler Core|URL Handler Core]]
- [[_COMMUNITY_Law Handler|Law Handler]]
- [[_COMMUNITY_MCP Law Research|MCP Law Research]]
- [[_COMMUNITY_App Config|App Config]]
- [[_COMMUNITY_Test Runner|Test Runner]]
- [[_COMMUNITY_Draft Logger|Draft Logger]]
- [[_COMMUNITY_App Entry Point|App Entry Point]]
- [[_COMMUNITY_Exit Handler|Exit Handler]]
- [[_COMMUNITY_Refresh Handler|Refresh Handler]]
- [[_COMMUNITY_Webpage Service|Webpage Service]]
- [[_COMMUNITY_Handlers Init|Handlers Init]]
- [[_COMMUNITY_Services Init|Services Init]]
- [[_COMMUNITY_Tests Init|Tests Init]]

## God Nodes (most connected - your core abstractions)
1. `_send_next_quiz()` - 12 edges
2. `_send_quiz_question()` - 11 edges
3. `generate_quiz()` - 11 edges
4. `_prefetch_next_question()` - 10 edges
5. `_call_with_models()` - 10 edges
6. `_handle_quiz_answer()` - 9 edges
7. `TestExtractVideoId` - 9 edges
8. `handle_quiz_command()` - 8 edges
9. `_seconds_until_midnight()` - 8 edges
10. `TestGetPlatform` - 8 edges

## Surprising Connections (you probably didn't know these)
- `_handle_word_query()` --references--> `notion-client>=3.0.0`  [INFERRED]
  handlers\text_handler.py → requirements.txt
- `setup_scheduler()` --references--> `apscheduler`  [EXTRACTED]
  scheduler.py → requirements.txt
- `handle_text()` --references--> `python-telegram-bot==21.5`  [EXTRACTED]
  handlers\text_handler.py → requirements.txt
- `_call_gemini()` --references--> `google-genai (Gemini SDK)`  [EXTRACTED]
  services\ai_service.py → requirements.txt
- `mcp` --conceptually_related_to--> `answer_law_query()`  [INFERRED]
  requirements.txt → services\ai_service.py

## Hyperedges (group relationships)
- **Quiz Delivery Pipeline (scheduler + handler + AI + Redis)** — scheduler_send_quiz_question, scheduler_start_daily_quiz, scheduler_resume_daily_quiz, text_handler_send_next_quiz, ai_service_generate_quiz, text_handler_redis_keys [INFERRED 0.90]
- **Background Prefetch System** — text_handler_prefetch_next_question, ai_service_generate_quiz_with_hint, ai_service_generate_quiz, ai_service_get_word_definition, concept_prefetch_pattern [EXTRACTED 1.00]
- **Quiz Answer Grading Pipeline (stage 1/2 vs 3+)** — text_handler_handle_quiz_answer, text_handler_levenshtein, ai_service_grade_writing, ai_service_parse_grade_response, concept_quiz_stage_system [EXTRACTED 1.00]
- **AI Provider Abstraction (Gemini primary, Claude fallback)** — ai_service_call_with_models, ai_service_call_gemini, ai_service_call_claude, req_google_genai, req_anthropic [EXTRACTED 1.00]

## Communities

### Community 0 - "AI Prompt Builders"
Cohesion: 0.09
Nodes (37): answer_law_query(), _build_github_prompt(), _build_url_prompt(), _build_youtube_prompt(), _call_claude(), _call_gemini(), _call_gemini_url(), _call_with_models() (+29 more)

### Community 1 - "Quiz Handler Flow"
Cohesion: 0.14
Nodes (29): Background Prefetch Pattern (asyncio.create_task), Quiz Mode (auto vs /quiz command), handle_quiz_command(), /quiz 명령어 — 카운트 초기화 후 즉시 첫 문제 출제., notion-client>=3.0.0, python-telegram-bot==21.5, redis[asyncio], 남은 퀴즈 있으면 이어서 출제. 완료 시 스킵. (+21 more)

### Community 2 - "Notion Service Tests"
Cohesion: 0.08
Nodes (8): notion_service 단위 테스트 — Notion API mock 사용., TestAddWord, TestDeletePage, TestExists, TestExistsWord, TestGetWordsDue, TestSave, TestUpdateWordStage

### Community 3 - "Notion Service Core"
Cohesion: 0.1
Nodes (18): add_word(), delete_page(), exists(), exists_word(), get_all_words(), get_words_due(), parse_word_page(), 영단어를 Notion DB에 저장하고 page_id 반환. (+10 more)

### Community 4 - "GitHub Service Tests"
Cohesion: 0.17
Nodes (9): _make_response(), github_service 단위 테스트 — 실제 HTTP 요청 없이 requests를 mock., _readme_response(), test_404_raises(), test_rate_limit_raises(), test_success_no_readme(), test_success_with_readme(), TestGetRepoInfo (+1 more)

### Community 5 - "YouTube Service"
Cohesion: 0.24
Nodes (12): Exception, _extract_video_id(), get_transcript(), _get_transcript_native(), _get_transcript_whisper(), 자막 없음 — 영상 자체에 자막이 없는 경우., 네트워크 차단 — 현재 실행 환경(AWS 등)에서 YouTube 접근이 막힌 경우., youtube_transcript_api 우선 → 차단/자막없음 시 yt-dlp + Whisper 폴백. (+4 more)

### Community 6 - "YouTube Service Tests"
Cohesion: 0.18
Nodes (2): youtube_service._extract_video_id 단위 테스트 — 외부 호출 없음., TestExtractVideoId

### Community 7 - "Quiz Scheduler"
Cohesion: 0.24
Nodes (9): apscheduler, QUIZ_SCHEDULES (9/15/22시 KST), 일시정지 10분 후 — 퀴즈 재개 여부 확인 메시지 전송., 일시정지 시 호출 — 10분 후 재개 알림 단발 job 등록., schedule_quiz_resume(), _send_resume_prompt(), setup_scheduler(), start_daily_quiz() (+1 more)

### Community 8 - "URL Handler Tests"
Cohesion: 0.2
Nodes (2): url_handler._get_platform 단위 테스트 — 외부 의존 없음., TestGetPlatform

### Community 9 - "Grammar Service"
Cohesion: 0.22
Nodes (8): get_grammar_due(), parse_grammar_page(), 문법 오류를 Notion grammar DB에 저장하고 page_id 반환., 오늘 리뷰할 grammar 항목 반환., Notion grammar 페이지에서 속성 추출., 퀴즈 결과에 따라 단계와 다음리뷰일 업데이트., save_grammar_error(), update_grammar_stage()

### Community 10 - "Debug Model CLI"
Cohesion: 0.44
Nodes (7): call_model(), main(), print_result(), 모델 가용성 및 품질 테스트. url_context 브라우징 + quiz 함수(explain_word, generate_quiz stage 1/, run_quiz(), run_url_context(), section()

### Community 11 - "Debug Words Due"
Cohesion: 0.33
Nodes (8): fetch_all_sorted(), fetch_with_filter(), main(), parse(), print_results(), 실제 Notion DB 조회 디버그 스크립트. 날짜를 입력받아 get_words_due() 결과를 출력합니다.  실행 방법 (nexus/ 디렉토, data_sources.query + on_or_before 필터 (현재 get_words_due 방식)., data_sources.query + 필터 없이 날짜 오름차순 (현재 get_all_words 방식).

### Community 12 - "AI Service Tests"
Cohesion: 0.22
Nodes (2): ai_service._parse_response 단위 테스트 — 외부 API 호출 없음., TestParseResponse

### Community 13 - "GitHub Service Core"
Cohesion: 0.36
Nodes (7): _build_headers(), get_repo_info(), _parse_github_url(), _parse_rate_limit(), X-RateLimit-Reset 헤더에서 남은 초 계산. 없으면 3600 반환., 다양한 GitHub URL 형태에서 (owner, repo) 추출.     예) https://github.com/user/repo/tree/, GitHub API로 레포 메타데이터 + README 병렬 조회.      URL → parse → (GET /repos/{owner}/{r

### Community 14 - "Webpage Service Tests"
Cohesion: 0.39
Nodes (7): _make_response(), webpage_service.get_content 단위 테스트 — requests mock 사용., test_basic_text_extraction(), test_long_text_truncated(), test_nav_footer_removed(), test_script_style_removed(), TestGetContent

### Community 15 - "URL Handler Core"
Cohesion: 0.57
Nodes (6): _get_platform(), _handle_generic(), _handle_github(), handle_url(), _log_failure(), 처리 실패 시 Notion에 오류 로그 저장.

### Community 16 - "Law Handler"
Cohesion: 0.7
Nodes (4): handle_law(), handle_law_query(), _k(), _search_and_reply()

### Community 17 - "MCP Law Research"
Cohesion: 0.6
Nodes (4): _call_tool(), _mcp_session(), MCP chain_full_research로 법령 종합 조사. 결과 문자열 반환., research_law()

### Community 18 - "App Config"
Cohesion: 0.5
Nodes (3): BaseSettings, Config, Settings

### Community 19 - "Test Runner"
Cohesion: 0.5
Nodes (3): _extract_short_error(), 전체 테스트 실행 스크립트 — nexus/ 디렉토리에서 실행: python run_tests.py, traceback 에서 마지막 2줄(원인 줄 + 예외 메시지)만 추출.

### Community 20 - "Draft Logger"
Cohesion: 0.67
Nodes (1): DRAFT 로그 래퍼 - 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록 - 구현 완료 후에도 코드에 유지 (주석 역할 겸용)  활성화: .

### Community 21 - "App Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Exit Handler"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Refresh Handler"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Webpage Service"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Handlers Init"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Services Init"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Tests Init"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **67 isolated node(s):** `DRAFT 로그 래퍼 - 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록 - 구현 완료 후에도 코드에 유지 (주석 역할 겸용)  활성화: .`, `Config`, `전체 테스트 실행 스크립트 — nexus/ 디렉토리에서 실행: python run_tests.py`, `traceback 에서 마지막 2줄(원인 줄 + 예외 메시지)만 추출.`, `due 단어 조회 후 퀴즈 문제 출제. 공통 로직.` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `App Entry Point`** (2 nodes): `main()`, `main.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Exit Handler`** (2 nodes): `handle_exit()`, `exit_handler.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Refresh Handler`** (2 nodes): `refresh_handler.py`, `handle_refresh()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Webpage Service`** (2 nodes): `webpage_service.py`, `get_content()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Handlers Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Services Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tests Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `generate_quiz()` connect `AI Prompt Builders` to `Quiz Handler Flow`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `_send_quiz_question()` connect `Quiz Handler Flow` to `AI Prompt Builders`, `Quiz Scheduler`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `_handle_quiz_answer()` connect `Quiz Handler Flow` to `AI Prompt Builders`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `DRAFT 로그 래퍼 - 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록 - 구현 완료 후에도 코드에 유지 (주석 역할 겸용)  활성화: .`, `Config`, `전체 테스트 실행 스크립트 — nexus/ 디렉토리에서 실행: python run_tests.py` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Prompt Builders` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Quiz Handler Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Notion Service Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._