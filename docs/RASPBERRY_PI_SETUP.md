# Raspberry Pi Setup

This project can run as a physical Sleep Airline kiosk on Raspberry Pi. A button on GPIO 17 triggers the current passenger flow: first press takes off, next press lands, and the generated captain broadcast plays through the attached speaker.

## Hardware

- Raspberry Pi with Raspberry Pi OS
- Momentary push button
- Speaker through 3.5mm, USB audio, HDMI audio, or Bluetooth
- Button wiring: GPIO 17 to one side of the button, GND to the other side

The script expects the GPIO input to use pull-up behavior and triggers when the button connects GPIO 17 to GND.

## Install on Raspberry Pi

```bash
sudo apt update
sudo apt install -y nodejs npm mpg123
npm install
npm install onoff
```

If your Pi uses an older Node.js, install Node 20 or newer before running the script.

## Environment

Create `.env.local` on the Raspberry Pi:

```env
PI_BASE_URL=https://sleep-airline-s2-main.vercel.app
PI_PASSENGER_ID=pi_001
PI_PASSENGER_NAME=Raspberry Pi Passenger
PI_GROUP_ID=group_01
PI_GPIO_PIN=17
PI_ROUTE_DIRECTION=auto
PI_BROADCAST_STYLE=formal_captain
PI_AUDIO_PLAYER=mpg123
```

If you run the full server locally on the Pi instead of Vercel, use:

```env
PI_BASE_URL=http://127.0.0.1:3000
```

Keep API keys in Vercel or `.env.local`; do not commit secrets.

## Run

```bash
npm run pi:start
```

Press the GPIO 17 button once to take off. Press it again after takeoff to land. The script checks passenger status before deciding which action to call.

## Speaker checks

List audio devices:

```bash
aplay -l
```

Test speaker playback:

```bash
speaker-test -t wav -c 2
```

If `mpg123` plays through the wrong output, set Raspberry Pi audio output in system settings or with `raspi-config`.

## Optional systemd service

Create `/etc/systemd/system/sleep-airline-pi.service`:

```ini
[Unit]
Description=Sleep Airline Raspberry Pi Button
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/home/pi/SleepAirlineS2-main
ExecStart=/usr/bin/npm run pi:start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sleep-airline-pi
sudo systemctl start sleep-airline-pi
sudo systemctl status sleep-airline-pi
```
