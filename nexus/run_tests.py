"""전체 테스트 실행 스크립트 — nexus/ 디렉토리에서 실행: python run_tests.py"""
import logging
import sys
import traceback
import unittest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)


def _extract_short_error(tb_str: str) -> str:
    """traceback 에서 마지막 2줄(원인 줄 + 예외 메시지)만 추출."""
    lines = [l for l in tb_str.strip().splitlines() if l.strip()]
    return " | ".join(lines[-2:]) if len(lines) >= 2 else lines[-1] if lines else ""


if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir="tests", pattern="test_*.py")

    print("\n" + "=" * 60)
    print("NEXUS 테스트 실행")
    print("=" * 60 + "\n")

    runner = unittest.TextTestRunner(verbosity=2, stream=sys.stdout)
    result = runner.run(suite)

    # 에러/실패 요약 출력
    issues = (
        [("FAIL", tc, tb) for tc, tb in result.failures] +
        [("ERROR", tc, tb) for tc, tb in result.errors]
    )

    if issues:
        print("\n" + "=" * 60)
        print("[ 에러 요약 — 아래 내용을 복사해서 붙여넣기 ]")
        print("=" * 60)
        for kind, tc, tb in issues:
            short = _extract_short_error(tb)
            print(f"[{kind}] {tc}")
            print(f"  {short}")
        print("=" * 60)

    print()
    if result.wasSuccessful():
        print(f"✔ 전체 통과: {result.testsRun}개")
    else:
        print(f"✘ 실패: {len(result.failures)}개, 오류: {len(result.errors)}개 / 전체: {result.testsRun}개")

    sys.exit(0 if result.wasSuccessful() else 1)
