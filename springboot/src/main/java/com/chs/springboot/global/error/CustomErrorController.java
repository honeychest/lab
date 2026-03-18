// [AGENT] 역할: Spring 에러 라우터 (/error) | 연관파일: error-500.html(resources/templates), React index.html | 동작: 500↑ → error-500.html 렌더링, 4xx → forward:/index.html(React SPA 위임)
package com.chs.springboot.global.error;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.Map;

@Controller
public class CustomErrorController implements ErrorController {

    /**
     * API 요청(axios 등)은 기본적으로 Accept에 application/json을 포함한다.
     * 이 경우 4xx/5xx를 SPA로 forward하지 않고, 상태코드를 그대로 내려준다.
     */
    @RequestMapping(value = "/error", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> handleErrorJson(HttpServletRequest request) {
        Object status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        int statusCode = status != null ? Integer.parseInt(status.toString()) : 500;

        Object message = request.getAttribute(RequestDispatcher.ERROR_MESSAGE);
        String msg = message != null ? message.toString() : "";

        return ResponseEntity.status(statusCode).body(Map.of(
                "status", statusCode,
                "message", msg
        ));
    }

    /**
     * 브라우저(HTML) 요청의 404는 React SPA로 위임한다.
     * 단, /api/** 같은 API 경로는 절대 index로 forward하지 않는다.
     */
    @RequestMapping(value = "/error")
    public String handleErrorHtml(HttpServletRequest request) {
        Object status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);

        if (status != null) {
            int statusCode = Integer.parseInt(status.toString());

            // 500번대 에러는 500.html로
            if (statusCode >= 500) {
                return "error-500";
            }

            // API는 SPA로 위임하지 않음 (403/404 그대로 유지해야 프론트가 감지 가능)
            String uri = request.getRequestURI();
            if (uri != null && (uri.startsWith("/api") || uri.startsWith("/actuator") || uri.startsWith("/swagger-ui") || uri.startsWith("/api-docs"))) {
                return "error-500";
            }

            // 브라우저 404는 React에서 처리하므로 index.html로 (SPA)
            if (statusCode == 404) {
                return "forward:/index.html";
            }
        }

        // 기본값: 500 에러 페이지
        return "error-500";
    }
}