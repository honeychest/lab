import axios from 'axios';

const API_BASE_URL = '/api/support';

/**
 * 텔레그램 문의 전송 (텍스트 + 선택적 이미지)
 * @param {string} message  - 문의 텍스트 (300자 이내)
 * @param {Blob|null} file  - 압축된 이미지 Blob (없으면 null)
 */
export const sendTelegramInquiry = async (message, file = null) => {
    const formData = new FormData();
    formData.append('message', message);
    if (file) formData.append('file', file, 'image.jpg');

    try {
        const response = await axios.post(`${API_BASE_URL}/inquiry`, formData);
        return response.data;
    } catch (error) {
        console.error("Failed to send inquiry:", error);
        throw error;
    }
};
