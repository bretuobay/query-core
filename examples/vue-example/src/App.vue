<template>
  <div id="app-container">
    <header>
      <h1>Vue 3 Posts</h1>
    </header>
    <main>
      <div v-if="postsState.isLoading">Loading posts...</div>
      <div v-else-if="postsState.isError">
        Error fetching posts: {{ postsState.error?.message || 'Unknown error' }}
      </div>
      <ul v-else-if="postsState.data && postsState.data.length > 0">
        <li v-for="post in postsState.data" :key="post.id">
          <h2>{{ post.title }}</h2>
          <p>{{ post.body }}</p>
        </li>
      </ul>
      <div v-else>No posts found.</div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { QueryCore } from 'query-core-client';
import type { EndpointState } from 'query-core-client'; // Use type-only import

// Define the type for a Post
interface Post {
  id: number;
  title: string;
  body: string;
}

// Create a single QueryCore instance
const queryCore = new QueryCore();
const POSTS_ENDPOINT_KEY = 'posts';

async function fetchPosts(): Promise<Post[]> {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts');
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
}

// Reactive state for posts
const postsState = ref<EndpointState<Post[]>>({
  data: undefined,
  isLoading: true,
  isError: false,
  error: undefined,
  lastUpdated: undefined,
});

let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  // Define the endpoint
  await queryCore.defineEndpoint<Post[]>(POSTS_ENDPOINT_KEY, fetchPosts);

  // Subscribe to the endpoint
  unsubscribe = queryCore.subscribe<Post[]>(POSTS_ENDPOINT_KEY, (state) => {
    postsState.value = state;
  });

  // Initial fetch if not already loading or data not present
  const currentState = queryCore.getState<Post[]>(POSTS_ENDPOINT_KEY);
  if (!currentState.isLoading && !currentState.data) {
    queryCore.refetch<Post[]>(POSTS_ENDPOINT_KEY);
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<style>
body {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin: 0;
  padding: 20px;
}

#app-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

header {
  text-align: center;
  margin-bottom: 20px;
}

header h1 {
  color: #333;
}
</style>
