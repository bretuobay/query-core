import { useEffect, useState } from 'react';
import './App.css';
import { QueryCore, EndpointState } from 'query-core-client';

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

function App() {
  const [postsState, setPostsState] = useState<EndpointState<Post[]>>({
    data: undefined,
    isLoading: true,
    isError: false,
    error: undefined,
    lastUpdated: undefined,
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function setupEndpoint() {
      // Define the endpoint
      await queryCore.defineEndpoint<Post[]>(POSTS_ENDPOINT_KEY, fetchPosts);

      // Subscribe to the endpoint
      unsubscribe = queryCore.subscribe<Post[]>(POSTS_ENDPOINT_KEY, (state) => {
        setPostsState(state);
      });

      // Initial fetch if not already loading or data not present
      // getState can be used to check current status before refetching
      const currentState = queryCore.getState<Post[]>(POSTS_ENDPOINT_KEY);
      if (!currentState.isLoading && !currentState.data) {
        queryCore.refetch<Post[]>(POSTS_ENDPOINT_KEY);
      }
    }

    setupEndpoint();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  if (postsState.isLoading) {
    return <div>Loading posts...</div>;
  }

  if (postsState.isError) {
    return <div>Error fetching posts: {postsState.error?.message || 'Unknown error'}</div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>React Posts</h1>
      </header>
      <main>
        {postsState.data ? (
          <ul>
            {postsState.data.map((post) => (
              <li key={post.id}>
                <h2>{post.title}</h2>
                <p>{post.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No posts found.</p>
        )}
      </main>
    </div>
  );
}

export default App;
