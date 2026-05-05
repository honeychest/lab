// 시간 포맷팅 관련 함수들

export function formatTimestamp(timestamp) {
    if (!timestamp) return '기록 없음';
    return new Date(timestamp).toLocaleString('ko-KR', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function formatLogTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('ko-KR', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function formatRelativeAge(timestamp) {
    if (!timestamp) return '기록 없음';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    return formatTimestamp(timestamp);
}
