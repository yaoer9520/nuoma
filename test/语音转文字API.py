import requests
import json

API_KEY = "ljhEDwnOPGSrGX5t13WaEaGL"
SECRET_KEY = "nhK9nhACe8yXIaasIpgXDsC4uBAxtTGQ"

def main():
        
    url = "https://vop.baidu.com/server_api"
    
    payload = json.dumps({
        "format": "pcm",
        "rate": 16000,
        "channel": 1,
        "cuid": "X39HfX66KdDi6waMk2tKp00UlUOH7hWB",
        "token": get_access_token()
    }, ensure_ascii=False)
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    response = requests.request("POST", url, headers=headers, data=payload.encode("utf-8"))
    
    response.encoding = "utf-8"
    print(response.text)
    

def get_access_token():
    """
    使用 AK，SK 生成鉴权签名（Access Token）
    :return: access_token，或是None(如果错误)
    """
    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {"grant_type": "client_credentials", "client_id": API_KEY, "client_secret": SECRET_KEY}
    return str(requests.post(url, params=params).json().get("access_token"))

if __name__ == '__main__':
    main()
