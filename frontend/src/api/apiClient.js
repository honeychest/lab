import axios from 'axios';

const apiClient = axios.create({
    withCredentials: true, // 요청 시 쿠키를 자동으로 붙여서 전송함 (httpOnly 인증용 쿠키)
});

apiClient.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response?.status === 503) {
            window.dispatchEvent(new CustomEvent('server-overloaded'));
        }
        return Promise.reject(error);
    }
);

export default apiClient;
