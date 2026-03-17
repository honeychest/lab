// [AGENT] T4-ANALYSIS: 공통 팔레트 설정 — LOW/MID/HIGH 레벨별 색상·아이콘 매핑

export const PALETTE = {
  // LOW: 노랑
  LOW:  {
    barColor:  'rgba(255, 215, 0, 0.8)',   // gold
    bgColor:   'rgba(255, 215, 0, 0.15)',
    icon:      '▲',
    iconColor: 'rgba(255, 215, 0, 0.8)',
  },
  // MID: 초록
  MID:  {
    barColor:  'rgba(0, 200, 0, 0.8)',
    bgColor:   'rgba(0, 200, 0, 0.15)',
    icon:      '▲',
    iconColor: 'rgba(0, 200, 0, 0.8)',
  },
  // HIGH: 빨강
  HIGH: {
    barColor:  'rgba(220, 20, 60, 0.8)',   // crimson
    bgColor:   'rgba(220, 20, 60, 0.15)',
    icon:      '▲',
    iconColor: 'rgba(220, 20, 60, 0.8)',
  },
};

export const PALETTE_LEVELS = ['LOW', 'MID', 'HIGH'];
