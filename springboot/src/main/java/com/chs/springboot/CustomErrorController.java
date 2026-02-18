package com.chs.springboot;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
public class CustomErrorController implements ErrorController {

    @RequestMapping("/error")
    public String handleError(HttpServletRequest request) {
        Object status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);

        if (status != null) {
            int statusCode = Integer.parseInt(status.toString());

            // 500번대 에러는 500.html로
            if (statusCode >= 500) {
                return "error-500";
            }

            // 404는 React에서 처리하므로 index.html로 (SPA)
            // 다른 4xx 에러도 React로 위임
            if (statusCode >= 400 && statusCode < 500) {
                return "forward:/index.html";
            }
        }

        // 기본값: 500 에러 페이지
        return "error-500";
    }
}