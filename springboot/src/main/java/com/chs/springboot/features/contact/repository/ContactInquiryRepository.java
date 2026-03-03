package com.chs.springboot.features.contact.repository;

import com.chs.springboot.features.contact.entity.ContactInquiry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ContactInquiryRepository extends JpaRepository<ContactInquiry, Long> {

    Optional<ContactInquiry> findByInquiryId(String inquiryId);
}
