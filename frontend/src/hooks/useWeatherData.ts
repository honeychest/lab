import { useEffect, useState } from "react";
import { GEO_ORDER } from "../features/weather/constants/regions";

export interface WeatherDataItem {
  name: string;
  tmp: number;
  time?: string;
  pop?: string;
  hum?: string;
  wind?: string;
  rain?: string;
  [key: string]: unknown;
}

interface UseWeatherDataResult {
  weatherList: WeatherDataItem[];
  availableHours: number[];
  selectedHour: number | null;
  setSelectedHour: (hour: number) => void;
  isInitialLoading: boolean;
  minT: number;
  maxT: number;
}

export function useWeatherData(): UseWeatherDataResult {
  const [weatherList, setWeatherList] = useState<WeatherDataItem[]>([]);
  const [availableHours, setAvailableHours] = useState<number[]>([]);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  // available-hours 먼저 조회해서 selectedHour 초기값 설정
  useEffect(() => {
    const fetchAvailableHours = async () => {
      try {
        const res = await fetch("/api/weather/available-hours");
        const data: number[] = await res.json();
        if (data && data.length > 0) {
          setAvailableHours(data);
          setSelectedHour(data[data.length - 1]); // 가장 최근 시간
          return;
        }
      } catch {
        // ignore, fallback below
      }

      // 실패 또는 빈 응답 시 현재 시각을 기준으로 0시~현재시각까지 fallback
      const nowHour = new Date().getHours();
      const fallback = Array.from({ length: nowHour + 1 }, (_, i) => i);
      setAvailableHours(fallback);
      setSelectedHour(fallback[fallback.length - 1]);
    };

    fetchAvailableHours();
  }, []);

  // 선택된 시간대의 전국 날씨 조회
  useEffect(() => {
    if (selectedHour === null) return;

    setIsInitialLoading(true);

    fetch(`/api/weather/all?hour=${selectedHour}`)
      .then((res) => res.json())
      .then((data) => {
        // 기존 App.jsx와 동일하게 GEO_ORDER 순서로 정렬
        const sorted: WeatherDataItem[] = GEO_ORDER.map((name) => ({
          name,
          ...(data?.[name] ?? {}),
          tmp: parseFloat(data?.[name]?.tmp ?? 0),
        }));

        setWeatherList(sorted);
        setIsInitialLoading(false);
      })
      .catch(() => {
        setWeatherList([]);
        setIsInitialLoading(false);
      });
  }, [selectedHour]);

  const allTemps = weatherList.map((w) => w.tmp);
  const minT = allTemps.length > 0 ? Math.min(...allTemps) : 0;
  const maxT = allTemps.length > 0 ? Math.max(...allTemps) : 0;

  return {
    weatherList,
    availableHours,
    selectedHour,
    setSelectedHour: (hour: number) => setSelectedHour(hour),
    isInitialLoading,
    minT,
    maxT,
  };
}

