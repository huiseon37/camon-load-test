# 개요

실시간 라이브 스트리밍을 지원하는 부스트캠프 커뮤니티 프로젝트 Cam’On을 진행하면서 채팅 기능을 구현하였습니다.

프로젝트를 마무리하고, 리팩토링을 통해 기존의 프로젝트를 개선하는 과정에서 채팅 서버를 개선하고자 했습니다.

기존에 `단일 인스턴스, 인메모리 세션 저장`으로 구현되어있던 채팅 서버는 다수의 사용자가 동시에 채팅을 보낼때 서버 안전성과 성능 측면에서 개선의 여지가 필요하다는 생각이 들었기 때문입니다.

저는 채팅 서버를 개선하기 위해 **Redis를 도입하고 인스턴스를 분리하는 수평확장**을 계획하였습니다. 하지만 그 전에 현재 구현되어있는 채팅 서버가 어느 정도의 사용자와 네트워크 통신을 감당할 수 있는지 한계를 파악한 후, 개선 전과 후의 차이를 수치로 비교하기 위해 부하테스트를 진행하게 되었습니다.

## 기존 채팅 서버
> - NestJS 기반 WebSocket 서버
> - [Socket.io](http://Socket.io)를 사용하여 채팅기능 구현
> - room 정보 등의 메타 데이터를 Map자료구조를 통해 인메모리 저장
> - 방 생성, 방 삭제, 채팅 등 일부 기능이 JWT 기반의 사용자 인증 필수

# 부하테스트 툴 비교

부하테스트를 하기 앞서 다양한 부하테스트 툴이 있어서 간단히 각 부하테스트 툴의 특징에 대해서 정리해보고, 프로젝트에 가장 적합한 툴을 선택하는 과정을 거쳤습니다.

### K6

- 테스트 스크립트 작성 시 Javascript, TypeScript 지원
- HTTP/HTTPS 프로토콜 위주로 지원하여 다양한 프로토콜을 필요로 하는 경우 한계가 있을 수 있음
- WebSocket 지원, [socket.io](http://socket.io) 지원은 X

### Artillery (채택)

- WebSocket, [socket.io](http://socket.io) 모두 지원
- Node.js 기반으로 JavaScript/YAML로 시나리오를 작성
- 시나리오 작성이 간단하고 직관적

### JMeter

- Java 기반의 가장 오래된 부하 테스트 도구
- 풍부한 GUI를 지원하여 초보자도 쉽게 사용 가능
- 다양한 프로토콜 (HTTP, JDBC, LDAP, SMTP) 지원
- 리소스 사용량이 상당히 높으며 대규모 테스트시 성능 제약

### Locust

- Python 기반으로 코드 작성이 직관적
- 사용자 행동을 시뮬레이션 하는 데 강점이 있음

# Artillery 채택 및 초기 테스트 셋업

간단하게 여러가지 부하테스트 툴을 비교하고 알아본 후 Artillery 툴을 선택하여 부하테스트를 진행하기로 결정했습니다. Artillery를 선택한 이유는 아래와 같습니다.

1. 채팅 서버가 [socket.io](http://socket.io)를 사용하여 구현되어 있는데, Artillery는 기본적으로 socket.io 엔진을 지원합니다.
2. Javascript/TypeScript를 사용하여 커스텀 함수를 사용하여 좀 더 디테일한 테스트를 쉽게 할 수 있을것 같았습니다.
3. [socket.io](http://socket.io) 공식문서에서 부하테스트 툴로 artillery를 소개하고 있어 신뢰도가 있었습니다.
4. Artillery는 yaml 형식으로 테스트 시나리오를 작성할 수 있어,  개발자가 의도한대로 테스트를 진행할 수 있습니다
    1. 저희 서버에서 `채팅 방 생성 - 사용자 입장 및 채팅 이벤트 발생 - 채팅 방 삭제` 순서로 테스트가 이루어져야 하는데 이를 자유롭게 다룰 수 있을것 같았습니다.

네가지의 이유 중 사실 1번과 3번 이유가 가장 커서 선택하게 되었습니다.

## Artillery 설치 및 간단한 시나리오 테스트

Artillery는 Node.js 기반의 부하 테스트 도구입니다. 따라서, 저는 Javascript 패키지 매니저인 `pnpm`을 사용하여 프로젝트를 생성한 후 그 프로젝트에 Artillery를 설치해주었습니다.

또한, [socket.io](http://socket.io) 엔진을 사용하여 테스트를 진행하기 위해 `artillery-engine-socketio-v3` 도 설치 해주었습니다. 이 내용은 [socket.io 공식문서의 부하테스트 파트](https://socket.io/docs/v4/load-testing/#manual-client-creation)에서 나와있습니다.

```jsx
pnpm add -D artillery artillery-engine-socketio-v3
```

(프로젝트가 아닌 로컬 환경에 artillery를 설치한다면 -D 대신 -g를 설치해주시면 되겠습니다.)

그리고 간단한 시나리오 테스트를 만들어 실행시켜 보았습니다. Artillery가 실행되면 실제로 서버에 로그가 찍히면서 영향이 미치는지 확인하고 싶었거든요.

```yaml
config:
  target: "<채팅 서버 주소>"
  phases:
    - duration: 10
      arrivalCount: 1
  engines:
    socketio-v3: {}
scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: "createRoom" 
          data:
            roomId: "<테스트용 roomId값>"
```

간단한 테스트 시나리오 입니다. 위의 테스트 시나리오는

1. `duration` : 10초 동안 테스트를 진행하는데
2. `arrivalCount` : 1명의 가상 사용자를 생성하여 진행하고
3. `createRoom` 이벤트를 발생시켜 채팅방을 생성하는

간단한 시나리오 입니다.

```jsx
"scripts": {
  "start": "artillery run camon-scenario.yml"
},
```

해당 시나리오를 실행시키기 위해 package.json의 `scripts` 부분에 테스트를 실행하는 명령어를 작성해주었고 pnpm start를 통해 테스트를 실행할 수 있었습니다.

![서버에서 Socket 객체를 확인한 결과](https://github.com/user-attachments/assets/3e3738b7-9188-4544-9ae1-4abfee357c70)

그 결과 채팅 서버에서 반응이 오는 것을 확인할 수 있었습니다. 서버에 `createRoom` 이벤트가 발생하면 socket client를 로그로 확인할 수 있도록 했는데 반응이 잘 오는것을 확인할 수 있었습니다!

# ExtraHeaders로 socket 토큰 인증

간단한 테스트 후 가장 먼저 해결 해야하는 문제가 있었습니다. 일부 채팅 기능에서 JWT 인증 과정이 필수적이었기에 부하 테스트 과정에서도 인증 토큰을 socket 요청에 담아 보내는 것이 필요했습니다.

```jsx
export class JWTAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const client = context.switchToWs().getClient<Socket>();
    const authorization = client.handshake.auth.accessToken || client.handshake.headers.accesstoken;

    return {
      headers: {
        authorization,
      },
    };
  }
  ...
```

저희가 구현한 채팅 서버에서는 nest의 guard와 strategy를 이용하여 로그인 인증을 진행하도록 구현하였고, jwt-guard에서 client(socket)의 `handshake.auth`혹은 `handshake.headers`에 `accessToken`값을 사용하여 인증된 사용자인지 검증하도록 구현되어있습니다.

Artillery에서 [socket.io](http://socket.io) 엔진을 사용하여 요청을 보낼때 헤더 혹은 auth에 accessToken을 담아서 보낼 수 있는 방법을 찾아보았고 [Artillery 공식문서의 ExtraHeaders 파트](https://www.artillery.io/docs/reference/engines/socketio#extra-headers)에서 해답을 찾을 수 있었습니다.

```yaml
config:
  ...
  socketio:
    extraHeaders:
      accessToken: "Bearer {{ $processEnvironment.JWT_TOKEN }}"
  ...
```

시나리오 yaml 파일에서 config에 위와 같은 코드를 작성하여 extraHeader를 추가해줍니다. 이렇게 하면 서버에서 받는 socket client의 handshake.headers에 `accesstoken : “Bearer token”` 형태로 인증 토큰이 들어오게 되어 인증이 필요한 채팅 혹은 방 만들기 이벤트를 발생 시킬 수 있게 됩니다.

![서버에서 Socket 객체를 확인한 결과](https://github.com/user-attachments/assets/a0430bba-0392-49cc-906f-eb343a231ffd)

모든 [socket.io](http://socket.io) 연결에 동일한 인증 헤더를 적용할 수 있었고 이를 통해 부하테스트에서 채팅의 모든 기능을 문제없이 동작시킬 수 있었습니다.

# 테스트 시나리오 작성

부하테스트를 진행하기 위해서 아래와 같은 순서로 요청이 동작하도록 시나리오를 구성해야 했습니다.
> 1. 채팅방 생성
> 2. 다수의 사용자가 채팅방에 접속
> 3. 사용자별 일정 갯수의 채팅 이벤트 발생
> 4. 채팅방 접속 종료
> 5. 모든 사용자가 채팅방을 나간 후 채팅방 삭제
위와 같이 시나리오를 구성하기 위해서 여러가지 방식으로 시나리오를 작성했습니다.

## 실패한 시나리오 1 : before hook 사용

다수의 사용자가 채팅방에 접속하고, 채팅 이벤트를 발생하는 테스트를 위해 방을 생성하는것이 우선시 되어야 했습니다.

또한 `scenarios` 에 방 생성 이벤트 발생 코드를 포함시킬 경우 테스트를 위해 생성되는 다수의 사용자가 모두 방 생성을 하게 되기 때문에 **`방 생성 시나리오는 조금 다른방식으로 작성`**해야 했습니다.

```yaml
scenarios:
  - name: "Chat room flow"
    engine: socketio

    flow:
      - emit:
          channel: "joinRoom"
          data:
            roomId: "{{ roomId }}"
      - think: 2

      - loop:
          - emit:
              channel: "chat"
              data:
                roomId: "{{ roomId }}"
                message: "Test message {{ $randomNumber(1, 1000) }}"
          - think: 1
        count: 5

      - emit:
          channel: "leaveRoom"
          data:
            roomId: "{{ roomId }}"
before:
  flow:
    - log: "Chat server load test starting"
    - emit:
        channel: "createRoom"
        data:
          roomId: "{{ roomId }}"
```

그래서 저는 artillery의 before hook을 이용해서 `createRoom` 이벤트를 발생시키고자 했습니다.

### 발생한 문제

그런데 채팅 서버에 아무런 반응이 없었고 artillery를 좀 더 학습하다 보니

> before hook은 테스트 실행전에 실행되는 설정 단계의 flow이기 때문에 [socket.io](http://socket.io) 연결이 아직 설정되지 않은 상태
> 

라는것을 알게되었습니다. 그래서 다른 방식으로 채팅방을 생성하고자 했습니다.

## 실패한 시나리오 2 : artillery 커스텀 코드 작성

artillery의 공식 문서를 읽으면서 [custom code](https://www.artillery.io/docs/reference/engines/http#loading-custom-code) 라는 것이 존재하는것을 알게 되었습니다. 일종의 `커스텀 함수, 커스텀 시나리오`라고 생각하면 될 것 같습니다.

저는 이것을 활용하여 방 생성 커스텀 코드를 작성하여 테스트를 위해 생성되는 사용자 중 첫 번째로 생성되는 사용자만 방을 생성하도록 시나리오를 작성하고자 했습니다.

```jsx
//processor.js
const counter = {value: 0};

function createRoom(context, events, done) {
    const roomId = context.vars.roomId;
    const socket = context.sockets[''];

    if (counter.value === 0) {
        socket.emit('createRoom', {roomId});
        counter.value++;
        return done();
    }

    counter.value++;
    return done();
}

export { createRoom };
```

```yaml
config:
	...(중략)
	processor: "createRoom.js"
	
scenarios:
  - flow:
      - function: "createRoom"
      
      - emit:
          channel: "joinRoom"
          data:
            roomId: "{{ roomId }}"
            
      ...(생략)
```

javascript 코드로 `proccessor 모듈을 생성`하고 `createRoom` 커스텀 함수를 구현하여 해당 함수가 가장 먼저 실행되도록 구현했습니다.

processor 모듈에는 counter 객체를 두어 `가장 먼저 생성되는 사용자만` 채팅 서버에 createRoom 이벤트를 발생시키도록 로직을 구현하여 다수의 사용자가 모두 채팅방을 생성하는 문제를 해결하였습니다.

### 발생한 문제

하지만 위의 방식은 채팅 서버 구현 방식에 의해 제약사항이 있었습니다.

프로젝트의 채팅 서버는 아래와 같은 특징으로 구현되어 있었습니다.

1. **소켓 연결이 끊기면 자동으로 방을 나가도록 구현**
2. **방장이 방을 나갈 경우 채팅 방은 삭제**

이 특징에 따라 위의 시나리오에는 아래와 같은 문제가 있었습니다.

1. **방을 생성하는 첫번째 사용자의 테스트가 끝나면 Artillery에서 소켓 연결을 종료시켜 자동으로 채팅방이 삭제**
2. **이후 사용자들의 테스트가 모두 실패**

그래서 저는 채팅방 생성을 테스트 시나리오에 포함시키는 것이 아닌, `socket-client` 를 활용하여 **테스트 실행 전 방을 생성**하고 테스트가 **완료된 후 방을 삭제**하는 방식으로 문제를 해결해야겠다고 생각했습니다. 

## 최종 시나리오 : 채팅방 생성 문제 해결

```jsx
//createRoom.js
import dotenv from 'dotenv';
import { io } from 'socket.io-client';

dotenv.config();

const TARGET = process.env.TARGET;
const roomId = process.env.ROOM_ID;

async function createRoom() {
    return new Promise((resolve, reject) => {
        const socket = io(TARGET,{
            extraHeaders:{
                accessToken: `Bearer ${process.env.JWT_TOKEN}`
            }
        });

        socket.emit('createRoom', {roomId}, ({roomId})=>{
            console.log('createRoom by', socket.id, roomId);
            resolve({socket});
        });

        socket.on('exception', (err)=>{
            console.log(err);
            reject();
        });
    })
}

createRoom();
```

저는 `socket.io-client` 를 이용해 createRoom 이벤트를 emit하는 함수를 작성하였고 해당 파일을 테스트 전에 실행하도록 package.json의 scripts부분을 변경하였습니다.

```jsx
"scripts": {
  "start": "node createRoom.js && artillery run camon-scenario.yml"
},
```

### 발생한 문제

하지만 scripts 코드를 이렇게 작성하니 createRoom 함수를 실행하는 `프로세스에서 소켓을 계속해서 채팅 서버와 연결`하고 있어 프로세스가 종료되지 않아 그 다음 단계인 테스트 실행 스크립트가 동작하지 않는 문제가 있었습니다.

### 쉘 스크립트 작성

이 문제를 해결하기 위해 저는 아래와 같은 쉘 스크립트를 작성하였습니다.

```jsx
#!/bin/bash
export $(cat .env | xargs)

node createRoom.js &
ROOM_PID=$!
sleep 1
npx artillery run --output report.json camon-scenario.yml
sleep 1
npx artillery report report.json
sleep 2
kill -9 $ROOM_PID
```

1. **createRoom 함수를 백그라운드에서 실행하고**
2. **테스트를 진행한 후**
3. **테스트 결과 파일을 생성하고**
4. **테스트 결과 파일 생성이 완료되면 백그라운드에서 실행되고 있는 프로세스를 종료**

또, package.json에서 scripts 부분을 아래와 같이 수정해주었습니다.

```jsx
"scripts": {
  "start": "chmod +x load-test-script.sh && ./load-test-script.sh"
},
```

## 테스트 동작

![image](https://github.com/user-attachments/assets/5405a445-4d84-4b49-9b1c-6014a8a8424f)


채팅 서버에 로그가 주루룩 찍히면서 부하테스트가 정상적으로 동작하는것을 확인했습니다!

# 마무리

부하테스트를 진행하고, 현재 채팅서버의 문제상황을 수치화하여 공유하며 채팅 서버를 개선하고자 하는 목표를 가졌습니다.
하지만, 아쉽게도 시간적 제약과 한정된 비용 문제로 인해 채팅 서버 개선은 진행하지 못하게 되었습니다.
비록 채팅 서버 개선까지 진행하여 모든 과정을 마무리 짓지는 못하였지만 부하테스트를 진행해보는 경험을 할 수 있었고, 그 과정에서 시스템의 병목 지점을 파악할 수 있었기에 의미있었던 시간이라고 생각하여 과정을 글로 남겨보았습니다.

향후에는 이번 경험을 바탕으로 보다 체계적인 부하테스트 시나리오를 구성하고, 실제 운영 환경에 가까운 테스트를 통해 더 정교하게 문제를 진단하고 개선하는 데까지 나아가보고 싶습니다. 다음에는 반드시 개선까지 이어지는 완성된 과정을 만들어보고자 합니다.
