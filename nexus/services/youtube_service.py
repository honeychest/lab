import logging
import os
import tempfile
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled, VideoUnavailable
from config import settings

logger = logging.getLogger(__name__)


class TranscriptUnavailable(Exception):
    """자막 없음 — 영상 자체에 자막이 없는 경우."""


class TranscriptBlocked(Exception):
    """네트워크 차단 — 현재 실행 환경(AWS 등)에서 YouTube 접근이 막힌 경우."""


def _extract_video_id(url: str) -> str:
    if "youtu.be/" in url:
        return url.split("youtu.be/")[1].split("?")[0]
    if "shorts/" in url:
        return url.split("shorts/")[1].split("?")[0]
    if "v=" in url:
        return url.split("v=")[1].split("&")[0]
    raise ValueError(f"유튜브 ID 추출 실패: {url}")


async def get_transcript(url: str) -> str:
    """youtube_transcript_api 우선 → 차단/자막없음 시 yt-dlp + Whisper 폴백."""
    try:
        return await _get_transcript_native(url)
    except (TranscriptBlocked, TranscriptUnavailable) as e:
        logger.info(f"transcript API 실패({e}), Whisper 폴백 시도")
        return await _get_transcript_whisper(url)


async def _get_transcript_native(url: str) -> str:
    """youtube_transcript_api로 자막 가져오기."""
    video_id = _extract_video_id(url)
    try:
        transcript = YouTubeTranscriptApi().fetch(
            video_id,
            languages=["ko", "en"]
        )
    except (NoTranscriptFound, TranscriptsDisabled):
        raise TranscriptUnavailable(f"자막 없음: {video_id}")
    except VideoUnavailable:
        raise TranscriptUnavailable(f"영상 없음 또는 비공개: {video_id}")
    except Exception as e:
        err = str(e).lower()
        if any(k in err for k in ("blocked", "403", "ip", "connection", "timeout", "refused")):
            raise TranscriptBlocked(f"YouTube 접근 차단: {e}")
        raise TranscriptBlocked(f"YouTube 요청 실패: {e}")

    text = " ".join([t.text for t in transcript])
    logger.info(f"자막 추출 완료 - video_id: {video_id}, 길이: {len(text)}")
    return text


async def _get_transcript_whisper(url: str) -> str:
    """yt-dlp로 오디오 다운로드 후 Groq Whisper로 전사."""
    if not settings.GROQ_API_KEY:
        raise TranscriptBlocked("GROQ_API_KEY 미설정 — Whisper 폴백 불가")

    import yt_dlp
    from groq import Groq

    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(tmpdir, "audio.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "64",
            }],
            "quiet": True,
            "no_warnings": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except Exception as e:
            raise TranscriptBlocked(f"yt-dlp 다운로드 실패: {e}")

        if not os.path.exists(audio_path):
            # 확장자가 다를 수 있으므로 탐색
            files = os.listdir(tmpdir)
            if not files:
                raise TranscriptBlocked("오디오 파일 생성 실패")
            audio_path = os.path.join(tmpdir, files[0])

        try:
            client = Groq(api_key=settings.GROQ_API_KEY)
            with open(audio_path, "rb") as f:
                result = client.audio.transcriptions.create(
                    file=f,
                    model="whisper-large-v3-turbo",
                    response_format="text",
                )
            text = result if isinstance(result, str) else result.text
            logger.info(f"Whisper 전사 완료 - 길이: {len(text)}")
            return text
        except Exception as e:
            raise TranscriptBlocked(f"Groq Whisper 전사 실패: {e}")
