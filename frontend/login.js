window.handleGoogleLogin = function (response) {
  const payload = JSON.parse(atob(response.credential.split('.')[1]));
  const { email, name, picture } = payload;

  localStorage.setItem('email', email);
  localStorage.setItem('username', name);
  localStorage.setItem('avatarUrl', picture);

   // ✅ STOP login music before redirecting
  const bgMusic = document.getElementById('bg-music');
  if (bgMusic) {
    bgMusic.pause();
    bgMusic.currentTime = 0;
  }

  window.location.href = "chat.html";
};
