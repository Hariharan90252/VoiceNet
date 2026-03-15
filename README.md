# VoiceNet

VoiceNet is a real-time web application that allows users to communicate via text and recorded audio clips. It features a robust backend built with Node.js, Express, and MongoDB, utilizing WebSockets for instant messaging and Nodemailer for automatic email notifications.

## 🚀 Features

- **Real-Time Communication**: Instant text and voice message broadcasting using WebSockets.
- **Voice Recording**: Integrated browser microphone support to record and upload audio clips (`.webm` or `.ogg`).
- **User Authentication**: Simple login/logout system tracking active users and last-seen timestamps.
- **Auto-Seeding**: Automatically generates 62 default user accounts upon initial database startup.
- **Email Notifications**: Automatically sends email alerts to offline/other users when a new text or audio message is broadcasted, as well as logout confirmation emails.
- **Audio Storage**: Local file storage using `multer` with metadata saved in MongoDB.
- **REST API**: Endpoints to fetch active users, user details, and manage stored audio clips.

## 🛠️ Tech Stack

**Backend:**
- Node.js & Express
- MongoDB & Mongoose (Database & ODM)
- ws (WebSockets for real-time events)
- Multer (Handling multipart/form-data for audio uploads)
- Nodemailer (Email dispatching)

**Frontend:**
- Vanilla HTML/CSS/JavaScript
- `MediaRecorder` API for capturing microphone audio

## 📋 Prerequisites

Before you begin, ensure you have met the following requirements:
- **Node.js** (v14 or higher)
- **MongoDB** running locally or a MongoDB Atlas URI
- An SMTP Email Account (e.g., Gmail with an App Password) for sending notifications

## ⚙️ Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd VoiceNet
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory and configure the following variables:
   ```env
   # Server
   PORT=3000
   PUBLIC_URL=http://localhost:3000

   # MongoDB
   MONGO_URI=mongodb://127.0.0.1:27017/voicenet

   # Email Configuration (Nodemailer)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=465
   EMAIL_SECURE=true
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   ```

4. **Start the application:**
   ```bash
   node server.js
   ```
   The server will start on `http://localhost:3000` (or your defined `PORT`). On the first run, the database will automatically be seeded with 62 initial users.

## 📡 API Endpoints

### Authentication
- `POST /login`: Authenticates a user using their register number and password. Updates their email if provided.
- `POST /logout`: Logs the user out, updates their last seen time, and triggers a logout email notification.

### Media Upload
- `POST /upload`: Expects `multipart/form-data` with an audio `file`. Saves the file to the `/uploads` directory, records it in MongoDB, and broadcasts the audio URL to all connected WebSocket clients.

### Data Fetching & Management
- `GET /api/user-details`: Retrieves a list of all users, their emails, and last seen times.
- `GET /api/active-users`: Retrieves a list of users currently connected via WebSockets.
- `GET /api/user-clips`: Fetches metadata for all stored audio clips.
- `DELETE /api/user-clips/:filename`: Deletes a specific audio clip from the local filesystem and the database.
- `DELETE /api/user-clips/user/:registerNumber`: Deletes all audio clips belonging to a specific user.

## 🔌 WebSocket Events

The WebSocket server listens for incoming connections and routes messages based on their `type`:

- `login`: Registers the client's session to track them as an "active user".
- `text`: Broadcasts a text message to all clients and triggers email notifications to other users.
- `audio`: Broadcasts the URL of a newly uploaded audio clip to all clients and triggers an email notification with the clip's URL.

## 🤝 Contributing

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.