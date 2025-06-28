<template>
  <div id="app-container">
    <nav>
      <router-link to="/">Dashboard</router-link>
      <router-link to="/posts">Posts</router-link>
    </nav>
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
// No script logic needed in App.vue anymore as it's handled by individual routed components
</script>

<style>
/* Global styles can remain here or be moved to a more global CSS file like main.css or style.css */
body {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin: 0;
  background-color: #f4f4f4; /* Added background for better contrast with app container */
}

#app-container {
  max-width: 960px; /* Increased max-width for better layout */
  margin: 20px auto;
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

nav {
  display: flex;
  justify-content: flex-start; /* Align to the left */
  align-items: center;
  padding-bottom: 10px;
  margin-bottom: 20px;
  border-bottom: 1px solid #eee;
}

nav a {
  margin-right: 20px; /* Spacing between items */
  text-decoration: none;
  color: #007bff;
  font-weight: bold;
  padding: 5px 10px;
  border-radius: 4px;
}

nav a:last-child {
  margin-right: 0;
}

nav a.router-link-exact-active {
  background-color: #e9ecef;
  color: #0056b3;
}

nav a:hover {
  background-color: #f8f9fa;
}

main {
  /* Styles for the main content area where router-view renders */
}
</style>
