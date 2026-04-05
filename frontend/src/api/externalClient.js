import axios from 'axios';

// 외부 API 전용 클라이언트 — withCredentials 없음
// Binance 등 서드파티 API는 CORS wildcard(*) 응답을 반환하므로
// withCredentials: true 와 함께 사용하면 브라우저가 차단함
const externalClient = axios.create();

export default externalClient;
