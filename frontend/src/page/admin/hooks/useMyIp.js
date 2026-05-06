import { useEffect, useState } from 'react';
import * as adminApi from '../api/adminApi';

export default function useMyIp() {
    const [myIp, setMyIp] = useState(null);

    useEffect(() => {
        adminApi.getMyIp().then(setMyIp).catch(() => {});
    }, []);

    return { myIp };
}
