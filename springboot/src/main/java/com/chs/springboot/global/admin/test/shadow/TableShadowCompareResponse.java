package com.chs.springboot.global.admin.test.shadow;

import java.util.List;

public record TableShadowCompareResponse(
        String profile,
        int minutes,
        int graceSeconds,
        List<TableShadowCompareRow> rows
) {
}
