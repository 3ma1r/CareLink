#pragma once

// Copy this file to secrets.h and fill in the provisioned values.
// Never put a Supabase service-role key or caregiver access token on the device.
#define BLYNK_TEMPLATE_ID "YOUR_BLYNK_TEMPLATE_ID"
#define BLYNK_TEMPLATE_NAME "CareLink wearable"
#define BLYNK_AUTH_TOKEN "YOUR_BLYNK_DEVICE_TOKEN"

constexpr char WIFI_SSID[] = "YOUR_WIFI_SSID";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char CAREGIVER_PHONE[] = "YOUR_PHONE_NUMBER";
constexpr char CARELINK_DEVICE_ID[] = "CL-XXXXXXXXXXXX";
constexpr char CARELINK_DEVICE_CREDENTIAL[] = "YOUR_64_CHARACTER_DEVICE_CREDENTIAL";
constexpr char CARELINK_INGEST_URL[] =
  "https://tztulntdpuhtnhwuzzvb.supabase.co/functions/v1/device-ingest";
