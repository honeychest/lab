package com.chs.springboot;

import com.binance.connector.client.impl.SpotClientImpl;
import org.jasypt.encryption.pbe.StandardPBEStringEncryptor;
import java.util.LinkedHashMap;

public class JasyptTest {
    public static void main(String[] args) {
        // 1. Jasypt 설정
        StandardPBEStringEncryptor jasypt = new StandardPBEStringEncryptor();
        // 실행 시 VM Options에 -Djasypt.encryptor.password=비밀번호 필수!
        jasypt.setPassword(System.getProperty("jasypt.encryptor.password"));

        // 2. .env에 작성한 ENC() 값을 여기에 복사 (테스트용)
        String encApiKey = "ENC(N7KU/rZJ+jGkCsu+ZuyHDad0oKveOyGYqzyndJV8fm3JkDq0GPzbFjthM8MdTy6/lfafssa3Pq47g86JaY/qaqqnTyqoLP9eDmUSXOsSr04=)";
        String encSecretKey = "ENC(aJKfOp2pt9QeKe191kdzBLCqFT1phUH2TLM/9AaxOnSfKw0gDf7qDNjxZYDLlbIQIoUqN77mlz+1Kg5A+4ti7FHw7pY01E64SpPp+cs/uC4=)";

        try {
            // 3. 복호화 (ENC괄호 제거 후 순수 암호문만 추출)
            String apiKey = jasypt.decrypt(encApiKey.substring(4, encApiKey.length() - 1));
            String secretKey = jasypt.decrypt(encSecretKey.substring(4, encSecretKey.length() - 1));

            // 4. 바이낸스 연동 및 시세 출력
            SpotClientImpl client = new SpotClientImpl(apiKey, secretKey);
            LinkedHashMap<String, Object> parameters = new LinkedHashMap<>();
            parameters.put("symbol", "BTCUSDT");

            String result = client.createMarket().tickerSymbol(parameters);

            System.out.println("====================================");
            System.out.println("🚀 바이낸스 연결 성공!");
            System.out.println("현재 시세: " + result);
            System.out.println("====================================");

        } catch (Exception e) {
            System.err.println("❌ 실행 실패: 비밀번호가 틀렸거나 키가 잘못되었습니다.");
            e.printStackTrace();
        }
    }
}