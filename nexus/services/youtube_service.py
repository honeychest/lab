import logging
from youtube_transcript_api import YouTubeTranscriptApi

logger = logging.getLogger(__name__)

def _extract_video_id(url: str) -> str:
    if "youtu.be/" in url:
        return url.split("youtu.be/")[1].split("?")[0]
    if "shorts/" in url:
        return url.split("shorts/")[1].split("?")[0]
    if "v=" in url:
        return url.split("v=")[1].split("&")[0]
    raise ValueError(f"유튜브 ID 추출 실패: {url}")

async def get_transcript(url: str) -> str:
    video_id = _extract_video_id(url)

    transcript = YouTubeTranscriptApi().fetch(
        video_id,
        languages=["ko", "en"]
    )

    text = " ".join([t.text for t in transcript])
    logger.info(f"자막 추출 완료 - video_id: {video_id}, 길이: {len(text)}")
    return text