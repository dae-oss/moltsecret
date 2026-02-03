
# Deploying a FastAPI Backend to Vercel

This guide provides instructions for deploying a Python FastAPI backend to Vercel's free tier.

## Prerequisites

* A Vercel account (you can sign up for free at [vercel.com](https://vercel.com)).
* A registered domain name (if you want a custom URL).
* Your FastAPI application code.

## Deployment Steps

1.  **Structure your project:**

    Your project should have the following structure:

    ```
    /
    ├── api/
    │   └── index.py
    ├── requirements.txt
    └── vercel.json
    ```

2.  **`api/index.py`:**

    This is the entry point for your FastAPI application.

    ```python
    from fastapi import FastAPI

    app = FastAPI()

    @app.get("/api")
    def read_root():
        return {"Hello": "World"}
    ```

3.  **`requirements.txt`:**

    List your Python dependencies in this file.

    ```
    fastapi
    uvicorn
    ```

4.  **`vercel.json`:**

    This file configures your Vercel deployment.

    ```json
    {
      "builds": [
        {
          "src": "api/index.py",
          "use": "@vercel/python"
        }
      ],
      "routes": [
        {
          "src": "/(.*)",
          "dest": "api/index.py"
        }
      ]
    }
    ```

5.  **Deploy to Vercel:**

    *   Push your code to a Git repository (GitHub, GitLab, or Bitbucket).
    *   Go to your Vercel dashboard and click "New Project".
    *   Import your Git repository.
    *   Vercel will automatically detect the `vercel.json` file and deploy your application.

6.  **Add a Custom Domain:**

    *   In your Vercel project settings, go to the "Domains" tab.
    *   Add your custom domain and follow the instructions to configure your DNS records.

## Conclusion

Vercel provides a free and scalable platform for deploying FastAPI applications. While there are some limitations on the free tier, it's an excellent choice for projects that need to handle potential traffic spikes.
