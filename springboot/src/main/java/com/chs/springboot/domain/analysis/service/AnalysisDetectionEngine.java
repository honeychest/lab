// [AGENT] T4-ANALYSIS: Java DetectionEngine — JS 구현과 동일 인터페이스·로직
// conditionTree JSON 스펙: T3-ARCH §3. JS/Java 동작 일치 보장.
package com.chs.springboot.domain.analysis.service;

import com.chs.springboot.domain.analysis.dto.ConditionGroupDto;
import com.chs.springboot.domain.analysis.dto.ConditionTreeDto;
import com.chs.springboot.domain.analysis.dto.ConditionUnitDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class AnalysisDetectionEngine {

    private static final int REF_BARS = 20;

    public record CandleData(long timeMs, double open, double high, double low, double close, double volume, double delta) {}

    /**
     * conditionTree를 klineData에 적용하여 매칭 봉 인덱스 목록 반환
     */
    public List<Integer> evaluate(List<CandleData> klineData, ConditionTreeDto tree) {
        if (tree == null || tree.getGroups() == null || tree.getGroups().isEmpty()) return List.of();

        List<Integer> results = new ArrayList<>();
        String groupOp = tree.getGroupOperator() != null ? tree.getGroupOperator() : "OR";

        for (int idx = 0; idx < klineData.size(); idx++) {
            boolean matched = evalGroups(klineData, idx, tree.getGroups(), groupOp);
            if (matched) results.add(idx);
        }
        return results;
    }

    private boolean evalGroups(List<CandleData> klineData, int idx, List<ConditionGroupDto> groups, String groupOp) {
        if ("OR".equals(groupOp)) {
            return groups.stream().anyMatch((g) -> evalGroup(klineData, idx, g));
        }
        return groups.stream().allMatch((g) -> evalGroup(klineData, idx, g));
    }

    private boolean evalGroup(List<CandleData> klineData, int idx, ConditionGroupDto group) {
        if (group.getUnits() == null || group.getUnits().isEmpty()) return true;
        String op = group.getOperator() != null ? group.getOperator() : "AND";

        if ("NOT".equals(op)) {
            return !evalUnit(klineData, idx, group.getUnits().get(0));
        }
        if ("OR".equals(op)) {
            return group.getUnits().stream().anyMatch((u) -> evalUnit(klineData, idx, u));
        }
        // AND (기본)
        return group.getUnits().stream().allMatch((u) -> evalUnit(klineData, idx, u));
    }

    private boolean evalUnit(List<CandleData> klineData, int idx, ConditionUnitDto unit) {
        boolean result = switch (unit.getType()) {
            case "VOLUME_SPIKE" -> evalVolumeSpike(klineData, idx, unit);
            case "PRICE_CHANGE" -> evalPriceChange(klineData, idx, unit);
            case "DELTA"        -> evalDelta(klineData, idx, unit);
            case "TIME_RANGE"   -> evalTimeRange(klineData, idx, unit);
            default -> {
                log.warn("[AnalysisDetectionEngine] Unknown condition type: {}", unit.getType());
                yield false;
            }
        };
        return Boolean.TRUE.equals(unit.getNot()) ? !result : result;
    }

    // ─── 조건 평가 메서드 ──────────────────────────────────────────────────────

    private boolean evalVolumeSpike(List<CandleData> klineData, int idx, ConditionUnitDto unit) {
        if (idx < REF_BARS) return false;
        double avg = klineData.subList(idx - REF_BARS, idx).stream()
                .mapToDouble(CandleData::volume).average().orElse(0);
        if (avg == 0) return false;
        double ratio = klineData.get(idx).volume() / avg;
        double val   = unit.getValue() != null ? unit.getValue() : 0;
        return compare(ratio, val, unit.getOp());
    }

    private boolean evalPriceChange(List<CandleData> klineData, int idx, ConditionUnitDto unit) {
        CandleData c = klineData.get(idx);
        if (c.open() == 0) return false;
        double pct = Math.abs((c.close() - c.open()) / c.open() * 100);
        double val = unit.getValue() != null ? unit.getValue() : 0;
        return compare(pct, val, unit.getOp());
    }

    private boolean evalDelta(List<CandleData> klineData, int idx, ConditionUnitDto unit) {
        double delta = klineData.get(idx).delta();
        if ("POSITIVE".equals(unit.getSign())) return delta > 0;
        if ("NEGATIVE".equals(unit.getSign())) return delta < 0;
        double val = unit.getValue() != null ? unit.getValue() : 0;
        return compare(delta, val, unit.getOp());
    }

    private boolean evalTimeRange(List<CandleData> klineData, int idx, ConditionUnitDto unit) {
        ZonedDateTime zdt = Instant.ofEpochMilli(klineData.get(idx).timeMs()).atZone(ZoneOffset.UTC);
        int cur   = zdt.getHour() * 60 + zdt.getMinute();
        int start = (unit.getStartHour() != null ? unit.getStartHour() : 0) * 60
                  + (unit.getStartMinute() != null ? unit.getStartMinute() : 0);
        int end   = (unit.getEndHour()   != null ? unit.getEndHour()   : 23) * 60
                  + (unit.getEndMinute() != null ? unit.getEndMinute() : 59);
        if (start <= end) return cur >= start && cur <= end;
        return cur >= start || cur <= end;
    }

    private boolean compare(double actual, double expected, String op) {
        if (op == null) return false;
        return switch (op) {
            case "GT"  -> actual >  expected;
            case "GTE" -> actual >= expected;
            case "LT"  -> actual <  expected;
            case "LTE" -> actual <= expected;
            default    -> false;
        };
    }
}
