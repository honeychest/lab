package com.chs.springboot;

import org.jasypt.encryption.pbe.StandardPBEStringEncryptor;

public class JasyptTest {
    // 1. Jasypt 설정
    StandardPBEStringEncryptor jasypt = new StandardPBEStringEncryptor();

    public static void main(String[] args) {
        JasyptTest jasyptTest = new JasyptTest();
        jasyptTest.init();

        String orgString = "1234";
        String encString = jasyptTest.encryptJasypt(orgString);
        jasyptTest.decryptString(encString);
        String ENCString = "ENC("+encString+")";
        System.out.println("ENCString = "+ENCString);
        String decString = jasyptTest.decENC(ENCString);
        if(orgString.equals(decString)){
            System.out.println("체크성공 입력값 == 복호화값");
            System.out.println("사용하시오 : "+ENCString);
        }else{
            System.out.println("체크실패 입력값 != 복호화값");
        }
    }

    protected void init(){
        // 실행 시 VM Options에 -Djasypt.encryptor.password=비밀번호 필수!
        jasypt.setPassword(System.getProperty("jasypt.encryptor.password"));
    }
    private String encryptJasypt (String keystring) {
        try {
            String encryptedStr = jasypt.encrypt(keystring);
            System.out.println("암호화된 키값 = " + encryptedStr);
            return encryptedStr;
        } catch (Exception e) {
            System.err.println("암호화 과정에서 예외가 발생했습니다: " + e.getMessage());
            return null;
        }
    }

    private String decryptString (String keString) {
        try {
            String decryptedStr = jasypt.decrypt(keString);
            System.out.println("복호화된 키값 = " + decryptedStr);
            return decryptedStr;
        } catch (Exception e) {
            System.err.println("복호화 과정에서 예외가 발생했습니다: " + e.getMessage());
            return null;
    }
}

    private String decENC (String ENC) {
        try {
            // 복호화 (ENC괄호 제거 후 순수 암호문만 추출)
            String removeENC = ENC.substring(4, ENC.length() - 1);
            String decENC = jasypt.decrypt(removeENC);
            System.out.println("ENC 제거된 복호화값 = " + decENC);
            return decENC;
        } catch (Exception e) {
            System.err.println("ENC 복호화 과정에서 예외가 발생했습니다: " + e.getMessage());
            return null;
        }
    }
}
