package com.chs.springboot.global.admin.test.shadow;

import java.util.List;

public record TableShadowMultiCompareResponse(
        String profile,
        List<TableShadowWindowSummary> windows
) {
}
