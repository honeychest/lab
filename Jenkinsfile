pipeline {
    agent any

    environment {
        REGISTRY = 'localhost:5010'
    }

    parameters {
        booleanParam(name: 'BACKEND_ONLY',  defaultValue: false, description: 'Backend 강제 배포')
        booleanParam(name: 'FRONTEND_ONLY', defaultValue: false, description: 'Frontend 강제 배포')
        booleanParam(name: 'NEXUS_ONLY',    defaultValue: false, description: 'Nexus 강제 배포')
    }

    stages {
        stage('Sync Local') {
            steps {
                sh 'git -C /Users/honey/devcontext/project/lab pull'
            }
        }

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
                    env.GIT_SHORT    = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                }
            }
        }

        stage('Build & Push Backend') {
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
                sh '''
                    cd $WORKSPACE/springboot
                    ./gradlew bootJar --no-daemon
                    docker build -t ${REGISTRY}/chsproject-docker:${GIT_SHORT} .
                    docker tag ${REGISTRY}/chsproject-docker:${GIT_SHORT} ${REGISTRY}/chsproject-docker:latest
                    docker push ${REGISTRY}/chsproject-docker:${GIT_SHORT}
                    docker push ${REGISTRY}/chsproject-docker:latest
                '''
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

        stage('Build & Push Frontend') {
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
                sh '''
                    cd $WORKSPACE/frontend
                    npm ci
                    npm run build
                    docker build -t ${REGISTRY}/chs-frontend:${GIT_SHORT} .
                    docker tag ${REGISTRY}/chs-frontend:${GIT_SHORT} ${REGISTRY}/chs-frontend:latest
                    docker push ${REGISTRY}/chs-frontend:${GIT_SHORT}
                    docker push ${REGISTRY}/chs-frontend:latest
                '''
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

        stage('Build & Push Nexus') {
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
                sh '''
                    docker build -t ${REGISTRY}/chs-nexus:${GIT_SHORT} $WORKSPACE/nexus
                    docker tag ${REGISTRY}/chs-nexus:${GIT_SHORT} ${REGISTRY}/chs-nexus:latest
                    docker push ${REGISTRY}/chs-nexus:${GIT_SHORT}
                    docker push ${REGISTRY}/chs-nexus:latest
                '''
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
                sh 'cd /Users/honey/devcontext/project/lab/springboot && docker compose pull nexus && docker compose up -d nexus'
            }
        }
    }
}
