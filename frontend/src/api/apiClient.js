import axios from 'axios';

const apiClient = axios.create();

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