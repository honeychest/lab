pipeline {
    agent any

    parameters {
        booleanParam(name: 'BACKEND_ONLY',  defaultValue: false, description: 'Backend 강제 배포')
        booleanParam(name: 'FRONTEND_ONLY', defaultValue: false, description: 'Frontend 강제 배포')
        booleanParam(name: 'NEXUS_ONLY',    defaultValue: false, description: 'Nexus 강제 배포')
    }

    stages {
        stage('Detect Changes') {
            steps {
                script {
                    def changed = sh(script: '''
                        if git rev-parse HEAD^2 > /dev/null 2>&1; then
                            git diff --name-only HEAD^1 HEAD^2
                        else
                            git diff --name-only HEAD~1 HEAD
                        fi
                    ''', returnStdout: true).trim()
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
                    anyOf {
                        environment name: 'DEPLOY_BACK', value: 'true'
                        expression { return params.BACKEND_ONLY }
                    }
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
                    anyOf {
                        environment name: 'DEPLOY_FRONT', value: 'true'
                        expression { return params.FRONTEND_ONLY }
                    }
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
                    anyOf {
                        environment name: 'DEPLOY_NEXUS', value: 'true'
                        expression { return params.NEXUS_ONLY }
                    }
                }
            }
            steps {
                sh 'cd /Users/honey/devcontext/project/lab/springboot && docker compose up -d --build nexus'
            }
        }
    }
}
