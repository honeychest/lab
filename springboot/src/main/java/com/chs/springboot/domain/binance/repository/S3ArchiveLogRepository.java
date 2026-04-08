// [AGENT] 역할: S3ArchiveLog JPA Repository | 연관파일: S3ArchiveLog.java, S3ArchiveService.java, ArchiveScanService.java, MetricCollectorService.java
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.S3ArchiveLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface S3ArchiveLogRepository extends JpaRepository<S3ArchiveLog, Long> {

    Optional<S3ArchiveLog> findByS3Key(String s3Key);

    boolean existsByS3Key(String s3Key);

    /** complete='Y' 인 레코드만 table_name 별 row_count 합산 */
    @Query("SELECT l.tableName AS tableName, SUM(l.rowCount) AS total " +
           "FROM S3ArchiveLog l WHERE l.complete = 'Y' GROUP BY l.tableName")
    List<TableRowCountProjection> sumRowCountByTableName();

    /** complete='Y' 인 레코드만 table_name 별 file_size_bytes 합산 */
    @Query("SELECT l.tableName AS tableName, SUM(l.fileSizeBytes) AS total " +
           "FROM S3ArchiveLog l WHERE l.complete = 'Y' GROUP BY l.tableName")
    List<TableRowCountProjection> sumFileSizeByTableName();

    interface TableRowCountProjection {
        String getTableName();
        Long getTotal();
    }
}
