import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EndpointState } from 'query-core-client';
import { queryCore, fetchPosts, POSTS_ENDPOINT_KEY, Post } from '../queryClient';

const PostsList: React.FC = () => {
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
      // Define the endpoint (it might have been defined elsewhere, QueryCore handles re-definition gracefully)
      await queryCore.defineEndpoint<Post[]>(POSTS_ENDPOINT_KEY, fetchPosts);

      // Subscribe to the endpoint
      unsubscribe = queryCore.subscribe<Post[]>(POSTS_ENDPOINT_KEY, (state) => {
        setPostsState(state);
      });

      // Initial fetch if not already loading or data not present
      const currentState = queryCore.getState<Post[]>(POSTS_ENDPOINT_KEY);
      if (!currentState.isLoading && !currentState.data) {
        // Check if data is undefined or empty array before refetching
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
    <div>
      <h1>Posts</h1>
      {postsState.data && postsState.data.length > 0 ? (
        <ul className="posts-list">
          {postsState.data.map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`}>
                <h2>{post.title}</h2>
              </Link>
              <p>{post.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No posts found.</p>
      )}
    </div>
  );
};

export default PostsList;
