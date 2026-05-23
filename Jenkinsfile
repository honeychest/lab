pipeline {
    agent any

    stages {
        stage('Detect Changes') {
            steps {
                script {
                    def changed = sh(script: 'git diff --name-only HEAD~1 HEAD', returnStdout: true).trim()
                    env.DEPLOY_BACK  = changed.contains('springboot/') ? 'true' : 'false'
                    env.DEPLOY_FRONT = changed.contains('frontend/')   ? 'true' : 'false'
                    env.DEPLOY_NEXUS = changed.contains('nexus/')      ? 'true' : 'false'
                }
            }
        }

        stage('Deploy Backend') {
            when {
                allOf {
                    branch 'main'
                    environment name: 'DEPLOY_BACK', value: 'true'
                }
            }
            steps {
                sh '/Users/honey/devcontext/project/lab/springboot/deploy-back-only.sh'
            }
        }

        stage('Deploy Frontend') {
            when {
                allOf {
                    branch 'main'
                    environment name: 'DEPLOY_FRONT', value: 'true'
                }
            }
            steps {
                sh '/Users/honey/devcontext/project/lab/frontend/deploy-front-only.sh'
            }
        }

        stage('Deploy Nexus') {
            when {
                allOf {
                    branch 'main'
                    environment name: 'DEPLOY_NEXUS', value: 'true'
                }
            }
            steps {
                sh 'cd /Users/honey/devcontext/project/lab/springboot && docker compose up -d --build nexus'
            }
        }
    }
}
