// [AGENT] 문의 관련 API 함수 + guestToken 유틸
// 엔드포인트: POST /inquiry, GET /inquiries, PATCH /reply/{id}/read
import axios from 'axios';

const API_BASE_URL = '/api/support';
const GUEST_TOKEN_KEY = 'chs_guest_token';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};

/**
 * 기기 영구 식별자 — localStorage에 없으면 생성 후 저장
 * @returns {string} UUID
 */
export const getGuestToken = () => {
    let token = localStorage.getItem(GUEST_TOKEN_KEY);
    if (!token) {
        token = generateUUID();
        localStorage.setItem(GUEST_TOKEN_KEY, token);
    }
    return token;
};

/**
 * 텔레그램 문의 전송 (텍스트 + 선택적 이미지)
 * @param {string}    message    - 문의 텍스트 (300자 이내)
 * @param {Blob|null} file       - 압축된 이미지 Blob (없으면 null)
 * @param {string}    inquiryId  - 프론트에서 생성한 UUID
 * @param {string}    guestToken - 기기 영구 식별자
 */
export const sendTelegramInquiry = async (message, file = null, inquiryId, guestToken) => {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('inquiryId', inquiryId);
    formData.append('guestToken', guestToken);
    if (file) formData.append('file', file, 'image.jpg');

    try {
        const response = await axios.post(`${API_BASE_URL}/inquiry`, formData);
        return response.data;
    } catch (error) {
        console.error("Failed to send inquiry:", error);
        throw error;
    }
};

/**
 * guestToken 기반 문의 목록 조회 (최신순)
 * @param {string} guestToken
 * @returns {Array} [{ inquiryId, message, createdAt, replyText, repliedAt, readAt }]
 */
export const fetchInquiries = async (guestToken) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/inquiries`, { params: { guestToken } });
        return response.data;
    } catch (error) {
        console.error("Failed to fetch inquiries:", error);
        throw error;
    }
};

/**
 * 답변 읽음 처리
 * @param {string} inquiryId
 * @param {string} guestToken
 */
export const markReplyRead = async (inquiryId, guestToken) => {
    try {
        await axios.patch(`${API_BASE_URL}/reply/${inquiryId}/read`, { guestToken });
    } catch (error) {
        console.error("Failed to mark reply as read:", error);
    }
};
