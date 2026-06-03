# RP2040 Firmware — Serial Output Format

The web app reads lines at **115200 baud** over USB CDC (USB Serial).

## Option A — Quaternion (preferred, glitch-free rotation)

```c
// MicroPython example (MPU-6050 + mahony/madgwick filter)
print(f"QUAT:{q_w:.4f},{q_x:.4f},{q_y:.4f},{q_z:.4f}")
```

Expected line:
```
QUAT:0.9971,0.0523,-0.0314,0.0012
```

## Option B — Euler angles (degrees)

```c
print(f"EULER:{roll:.2f},{pitch:.2f},{yaw:.2f}")
```

Expected line:
```
EULER:5.23,-12.10,87.44
```

## MicroPython boilerplate (MPU-6050 via I2C)

```python
import time
from machine import I2C, Pin
# install: mip.install("github:micropython-IMU/micropython-IMU")
from imu import MPU6050

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400_000)
imu = MPU6050(i2c)

while True:
    roll  = imu.accel.roll
    pitch = imu.accel.pitch
    # yaw requires magnetometer or integration
    yaw   = 0.0
    print(f"EULER:{roll:.2f},{pitch:.2f},{yaw:.2f}")
    time.sleep_ms(20)  # 50 Hz
```

## Running the web app

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **Connect USB**, select the RP2040 serial port.
Requires Chrome or Edge 89+ (Web Serial API).
