const COGNITO_URL = 'https://cognito-idp.us-east-1.amazonaws.com/';
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;

export const loginUser = async (email, password) => {
  const response = await fetch(COGNITO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  });

  const data = await response.json();

  if (data.AuthenticationResult) {
    // Save AccessToken — backend requires this (tokenUse: 'access')
    localStorage.setItem('accessToken', data.AuthenticationResult.AccessToken);

    // Read role and teamId from IdToken
    const payload = JSON.parse(atob(data.AuthenticationResult.IdToken.split('.')[1]));
    const user = {
      username: payload['cognito:username'],
      email: payload.email,
      role: payload['custom:role'] || 'Employee',
      teamId: payload['custom:teamId'] || null,
    };
    localStorage.setItem('user', JSON.stringify(user));
    return { success: true, user };
  }

  if (data.__type === 'NotAuthorizedException')
    return { success: false, error: 'Wrong email or password' };
  if (data.__type === 'UserNotFoundException')
    return { success: false, error: 'User not found' };
  return { success: false, error: data.message || 'Login failed' };
};

export const getCurrentUser = () => {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch { return null; }
};

export const logoutUser = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
};

export const isLoggedIn = () => !!localStorage.getItem('accessToken');