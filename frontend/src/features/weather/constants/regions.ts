// Purpose: 지역 관련 상수 — 10개 시도 순서(GEO_ORDER) 및 도시-시도 매핑(CITY_TO_PROVINCE)
export const GEO_ORDER = [
  "서울특별시",
  "경기도",
  "강원도",
  "충청북도",
  "충청남도",
  "전라북도",
  "경상북도",
  "전라남도",
  "경상남도",
  "제주특별자치도",
];

export const CITY_TO_PROVINCE: Record<string, string> = {
  "광주": "전라남도",
  "대구": "경상북도",
  "대전": "충청남도",
  "울산": "경상남도",
  "부산": "경상남도",
  "인천": "경기도",
  "세종": "충청남도",
};

