// [AGENT] T4-ANALYSIS: ConditionUnit 플러그인 레지스트리
import { evaluate as volumeSpike } from './conditions/volumeSpike.js';
import { evaluate as priceChange  } from './conditions/priceChange.js';
import { evaluate as delta        } from './conditions/delta.js';
import { evaluate as timeRange    } from './conditions/timeRange.js';

export const conditionRegistry = {
  VOLUME_SPIKE: volumeSpike,
  PRICE_CHANGE: priceChange,
  DELTA:        delta,
  TIME_RANGE:   timeRange,
};
