self.addEventListener('push', event => {
  const data = event.data.json();
  self.registration.showNotification('VoiceNet', {
    body: `${data.sender}: ${data.message}`,
    icon: '/icon.png'
  });
});