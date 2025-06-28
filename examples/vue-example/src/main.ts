import { createApp } from 'vue';
import App from './App.vue';
import router from './router'; // Import the router
// import "./style.css"; // Original style import
import './assets/main.css'; // Current style import

const app = createApp(App);

app.use(router); // Use the router

app.mount('#app');
