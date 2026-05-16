package com.chs.springboot.global.admin.test.shadow;

import java.util.List;

public record TableShadowCompareResponse(
        String profile,
        int minutes,
        List<TableShadowCompareRow> rows
) {
}
