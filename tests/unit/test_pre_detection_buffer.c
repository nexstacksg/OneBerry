/**
 * @file test_pre_detection_buffer.c
 * @brief Unit tests for pre-detection buffer strategy capability guards.
 */

#define _POSIX_C_SOURCE 200809L
#define _GNU_SOURCE

#include <stdint.h>

#include "unity.h"
#include "video/pre_detection_buffer.h"

void setUp(void) {
}

void tearDown(void) {
}

void test_memory_packet_capabilities(void) {
    uint32_t caps = buffer_strategy_type_capabilities(BUFFER_STRATEGY_MEMORY_PACKET);

    TEST_ASSERT_TRUE((caps & PRE_BUFFER_CAP_ADD_PACKET) != 0);
    TEST_ASSERT_TRUE((caps & PRE_BUFFER_CAP_FLUSH_TO_FILE) != 0);
    TEST_ASSERT_TRUE((caps & PRE_BUFFER_CAP_FLUSH_TO_CALLBACK) != 0);
    TEST_ASSERT_FALSE((caps & PRE_BUFFER_CAP_FLUSH_TO_WRITER) != 0);
}

void test_segment_strategy_capabilities(void) {
    uint32_t caps = buffer_strategy_type_capabilities(BUFFER_STRATEGY_HLS_SEGMENT);

    TEST_ASSERT_TRUE((caps & PRE_BUFFER_CAP_ADD_SEGMENT) != 0);
    TEST_ASSERT_TRUE((caps & PRE_BUFFER_CAP_PROTECT_SEGMENT) != 0);
    TEST_ASSERT_TRUE((caps & PRE_BUFFER_CAP_GET_SEGMENTS) != 0);
    TEST_ASSERT_TRUE((caps & PRE_BUFFER_CAP_FLUSH_TO_FILE) != 0);
    TEST_ASSERT_FALSE((caps & PRE_BUFFER_CAP_FLUSH_TO_CALLBACK) != 0);
}

void test_flush_mode_support_matrix(void) {
    TEST_ASSERT_TRUE(buffer_strategy_type_supports_flush_mode(BUFFER_STRATEGY_GO2RTC_NATIVE,
                                                              FLUSH_MODE_TO_FILE));
    TEST_ASSERT_FALSE(buffer_strategy_type_supports_flush_mode(BUFFER_STRATEGY_GO2RTC_NATIVE,
                                                               FLUSH_MODE_TO_CALLBACK));

    TEST_ASSERT_TRUE(buffer_strategy_type_supports_flush_mode(BUFFER_STRATEGY_MMAP_HYBRID,
                                                              FLUSH_MODE_TO_CALLBACK));
    TEST_ASSERT_FALSE(buffer_strategy_type_supports_flush_mode(BUFFER_STRATEGY_MMAP_HYBRID,
                                                               FLUSH_MODE_TO_FILE));

    TEST_ASSERT_FALSE(buffer_strategy_type_supports_flush_mode(BUFFER_STRATEGY_MEMORY_PACKET,
                                                               FLUSH_MODE_TO_WRITER));
}

void test_none_and_unknown_have_no_capabilities(void) {
    TEST_ASSERT_EQUAL_UINT32(0, buffer_strategy_type_capabilities(BUFFER_STRATEGY_NONE));
    TEST_ASSERT_EQUAL_UINT32(0, buffer_strategy_type_capabilities(BUFFER_STRATEGY_COUNT));
    TEST_ASSERT_FALSE(buffer_strategy_type_supports_flush_mode(BUFFER_STRATEGY_NONE,
                                                               FLUSH_MODE_TO_FILE));
}

int main(void) {
    UNITY_BEGIN();
    RUN_TEST(test_memory_packet_capabilities);
    RUN_TEST(test_segment_strategy_capabilities);
    RUN_TEST(test_flush_mode_support_matrix);
    RUN_TEST(test_none_and_unknown_have_no_capabilities);
    return UNITY_END();
}
