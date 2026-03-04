import axios from 'axios';

const API_BASE_URL = '/api/support';

/**
 * 텔레그램 문의 전송 (텍스트 + 선택적 이미지)
 * @param {string}      message   - 문의 텍스트 (300자 이내)
 * @param {Blob|null}   file      - 압축된 이미지 Blob (없으면 null)
 * @param {string}      inquiryId - 프론트에서 생성한 UUID
 */
export const sendTelegramInquiry = async (message, file = null, inquiryId) => {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('inquiryId', inquiryId);
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
 * 관리자 답변 조회
 * @param {string} inquiryId
 * @returns {object|null} { message, createdAt, replyText, repliedAt } 또는 null(미답변)
 */
export const fetchReply = async (inquiryId) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/reply/${inquiryId}`);
        return response.data;
    } catch (error) {
        if (error.response?.status === 204) return null; // 미답변
        throw error;
    }
};
